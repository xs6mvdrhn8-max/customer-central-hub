import { useMemo, useState } from 'react';
import { useStore, uid } from '@/store/StoreContext';
import { Product, PurchaseOrder, PurchaseLine } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Download, ShoppingCart, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv, toCsv } from '@/lib/csv';
import { printHtml, escapeHtml } from '@/lib/print';

const HEADERS = ['name', 'category', 'sku', 'barcode', 'stock', 'reorderLevel', 'suggestedQty', 'cost', 'vendor', 'location'];

interface Row {
  product: Product;
  vendorId: string;
  vendorName: string;
  suggestedQty: number;
  selected: boolean;
}

export function ReorderAdmin() {
  const { products, vendors, upsertPurchase, formatPrice, settings } = useStore();
  const [rows, setRows] = useState<Row[]>(() => buildRows(products, vendors));
  const [filter, setFilter] = useState('');

  function buildRows(prods: Product[], vens: typeof vendors): Row[] {
    return prods
      .filter((p) => p.stock <= (p.reorderLevel || 0))
      .map((p) => {
        const v = vens.find((x) => x.id === p.vendorId);
        const target = Math.max((p.reorderLevel || 0) * 2, (p.reorderLevel || 0) + 1, 1);
        const suggested = Math.max(target - p.stock, 1);
        return {
          product: p,
          vendorId: p.vendorId || '',
          vendorName: v?.name || 'Unassigned',
          suggestedQty: suggested,
          selected: true,
        };
      });
  }

  const refresh = () => {
    setRows(buildRows(products, vendors));
    toast.success('Refreshed low stock list');
  };

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) =>
      r.product.name.toLowerCase().includes(q) ||
      r.vendorName.toLowerCase().includes(q) ||
      (r.product.sku || '').toLowerCase().includes(q) ||
      (r.product.barcode || '').toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { vendorId: string; vendorName: string; items: Row[] }>();
    for (const r of filtered) {
      const key = r.vendorId || '__none__';
      if (!map.has(key)) map.set(key, { vendorId: r.vendorId, vendorName: r.vendorName, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values());
  }, [filtered]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.product.id === id ? { ...r, ...patch } : r)));
  };

  const toggleVendor = (vendorId: string, selected: boolean) => {
    setRows((prev) => prev.map((r) => ((r.vendorId || '') === vendorId ? { ...r, selected } : r)));
  };

  const exportAllCsv = () => {
    const list = filtered;
    if (list.length === 0) return toast.error('No low stock items');
    const data = list.map((r) => ({
      name: r.product.name,
      category: r.product.category,
      sku: r.product.sku || '',
      barcode: r.product.barcode || '',
      stock: r.product.stock,
      reorderLevel: r.product.reorderLevel,
      suggestedQty: r.suggestedQty,
      cost: r.product.cost,
      vendor: r.vendorName,
      location: r.product.location || '',
    }));
    downloadCsv(`reorder-all-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data, HEADERS));
    toast.success(`Exported ${data.length} rows`);
  };

  const exportVendorCsv = (vendorName: string, items: Row[]) => {
    const data = items.map((r) => ({
      name: r.product.name,
      category: r.product.category,
      sku: r.product.sku || '',
      barcode: r.product.barcode || '',
      stock: r.product.stock,
      reorderLevel: r.product.reorderLevel,
      suggestedQty: r.suggestedQty,
      cost: r.product.cost,
      vendor: vendorName,
      location: r.product.location || '',
    }));
    const safe = vendorName.replace(/\s+/g, '-');
    downloadCsv(`reorder-${safe}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data, HEADERS));
    toast.success(`Exported ${data.length} items for ${vendorName}`);
  };

  const printGroup = (vendorName: string, items: Row[]) => {
    if (items.length === 0) return;
    const rowsHtml = items.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(r.product.name)}${r.product.sku ? `<br/><span class="muted">SKU: ${escapeHtml(r.product.sku)}</span>` : ''}</td>
      <td>${escapeHtml(r.product.barcode || '')}</td>
      <td class="right">${r.product.stock}</td>
      <td class="right">${r.product.reorderLevel}</td>
      <td class="right">${r.suggestedQty}</td>
      <td class="right">${formatPrice(r.product.cost)}</td>
      <td class="right">${formatPrice(r.product.cost * r.suggestedQty)}</td>
    </tr>`).join('');
    const total = items.reduce((s, r) => s + r.product.cost * r.suggestedQty, 0);
    const body = `
      <h2>Reorder List — ${escapeHtml(vendorName)}</h2>
      <p class="muted">${items.length} items · ${new Date().toLocaleDateString()}</p>
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Barcode</th><th class="right">Stock</th><th class="right">Min</th><th class="right">Order Qty</th><th class="right">Cost</th><th class="right">Amount</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <table class="totals"><tr><td class="grand">Total</td><td class="grand">${formatPrice(total)}</td></tr></table>
    `;
    printHtml(body, `Reorder ${vendorName}`, {
      storeName: settings.storeName,
      storeNote: settings.storeNote,
      logoUrl: settings.logoImageUrl,
    });
  };

  const createPOForVendor = (vendorName: string, items: Row[]) => {
    const selected = items.filter((r) => r.selected && r.suggestedQty > 0);
    if (selected.length === 0) return toast.error('No items selected');
    const lines: PurchaseLine[] = selected.map((r) => ({
      itemName: r.product.name,
      orderedQty: r.suggestedQty,
      receivedQty: 0,
      cost: r.product.cost,
    }));
    const po: PurchaseOrder = {
      id: uid(),
      vendorName: vendorName === 'Unassigned' ? '' : vendorName,
      status: 'ordered',
      orderDate: new Date().toISOString().slice(0, 10),
      lines,
      note: 'Auto-generated from low stock reorder',
    };
    upsertPurchase(po);
    toast.success(`PO created · ${vendorName} · ${lines.length} items`);
  };

  const createAllPOs = () => {
    let count = 0;
    for (const g of grouped) {
      const selected = g.items.filter((r) => r.selected && r.suggestedQty > 0);
      if (selected.length === 0) continue;
      const lines: PurchaseLine[] = selected.map((r) => ({
        itemName: r.product.name,
        orderedQty: r.suggestedQty,
        receivedQty: 0,
        cost: r.product.cost,
      }));
      upsertPurchase({
        id: uid(),
        vendorName: g.vendorName === 'Unassigned' ? '' : g.vendorName,
        status: 'ordered',
        orderDate: new Date().toISOString().slice(0, 10),
        lines,
        note: 'Auto-generated from low stock reorder',
      });
      count++;
    }
    if (count === 0) toast.error('Nothing selected'); else toast.success(`Created ${count} purchase orders`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h4 className="font-semibold">Low Stock Reorder ({rows.length})</h4>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Search…" className="max-w-xs h-9" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
            <Button size="sm" variant="outline" onClick={exportAllCsv}>
              <Download className="w-3.5 h-3.5 mr-1" /> Export All CSV
            </Button>
            <Button size="sm" onClick={createAllPOs}>
              <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Create All POs
            </Button>
          </div>
        </div>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No items at or below reorder level. 🎉</p>}
      </Card>

      {grouped.map((g) => {
        const total = g.items.reduce((s, r) => s + (r.selected ? r.product.cost * r.suggestedQty : 0), 0);
        const allSelected = g.items.every((r) => r.selected);
        return (
          <Card key={g.vendorId || 'none'} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={(v) => toggleVendor(g.vendorId, !!v)} />
                <div>
                  <p className="font-semibold">{g.vendorName}</p>
                  <p className="text-xs text-muted-foreground">{g.items.length} items · Est. {formatPrice(total)}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="ghost" onClick={() => printGroup(g.vendorName, g.items)}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Print
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportVendorCsv(g.vendorName, g.items)}>
                  <Download className="w-3.5 h-3.5 mr-1" /> CSV
                </Button>
                <Button size="sm" onClick={() => createPOForVendor(g.vendorName, g.items)}>
                  <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Create PO
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-right">Stock</th>
                    <th className="p-2 text-right">Min</th>
                    <th className="p-2 text-right w-24">Order Qty</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => (
                    <tr key={r.product.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Checkbox checked={r.selected} onCheckedChange={(v) => updateRow(r.product.id, { selected: !!v })} />
                      </td>
                      <td className="p-2">
                        <p className="font-medium">{r.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.product.category}
                          {r.product.sku ? ` · SKU ${r.product.sku}` : ''}
                          {r.product.barcode ? ` · ⌗ ${r.product.barcode}` : ''}
                        </p>
                      </td>
                      <td className="p-2 text-right">
                        <span className={r.product.stock === 0 ? 'text-destructive font-semibold' : ''}>{r.product.stock}</span>
                      </td>
                      <td className="p-2 text-right">{r.product.reorderLevel}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={r.suggestedQty}
                          onChange={(e) => updateRow(r.product.id, { suggestedQty: Math.max(0, Number(e.target.value)) })}
                        />
                      </td>
                      <td className="p-2 text-right">{formatPrice(r.product.cost)}</td>
                      <td className="p-2 text-right">{formatPrice(r.product.cost * r.suggestedQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
