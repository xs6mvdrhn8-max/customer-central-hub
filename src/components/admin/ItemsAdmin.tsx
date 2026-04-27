import { useState } from 'react';
import { useStore, uid } from '@/store/StoreContext';
import { Product } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, Printer, Download, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { BarcodeInput } from '@/components/BarcodeInput';
import { SortableList } from '@/components/SortableList';
import { printHtml, escapeHtml } from '@/lib/print';
import { downloadCsv, parseCsv, pickFile, toCsv } from '@/lib/csv';

const ITEM_CSV_HEADERS = [
  'name', 'category', 'price', 'originalPrice', 'cost', 'stock',
  'reorderLevel', 'barcode', 'sku', 'location', 'description', 'badge',
];

const empty: Product = {
  id: '', name: '', category: '', price: 0, cost: 0, stock: 0, reorderLevel: 0,
  badge: '', barcode: '', vendorId: '', location: '', imageUrl: '', description: '',
};

export function ItemsAdmin() {
  const { products, vendors, categories, upsertProduct, deleteProduct, setProducts, formatPrice, settings } = useStore();
  const [form, setForm] = useState<Product>(empty);
  const [search, setSearch] = useState('');

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.category) {
      toast.error('Name and category required');
      return;
    }
    upsertProduct({ ...form, id: form.id || uid() });
    toast.success(form.id ? 'Item updated' : 'Item added');
    setForm(empty);
  };

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
  });

  const printList = () => {
    const list = filtered;
    if (list.length === 0) return toast.error('No items to print');
    const rows = list
      .map(
        (p, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(p.name)}${p.sku ? `<br/><span class="muted">SKU: ${escapeHtml(p.sku)}</span>` : ''}</td>
          <td>${escapeHtml(p.category)}</td>
          <td>${escapeHtml(p.barcode || '')}</td>
          <td class="right">${p.stock}</td>
          <td class="right">${formatPrice(p.cost)}</td>
          <td class="right">${formatPrice(p.price)}</td>
        </tr>`,
      )
      .join('');
    const body = `
      <h2>Items List</h2>
      <p class="muted">${list.length} items${search ? ` · filter: "${escapeHtml(search)}"` : ''}</p>
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Category</th><th>Barcode</th><th class="right">Stock</th><th class="right">Cost</th><th class="right">Price</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    printHtml(body, 'Items List', {
      storeName: settings.storeName,
      storeNote: settings.storeNote,
      logoUrl: settings.logoImageUrl,
    });
  };

  const exportCsv = () => {
    const rows = products.map((p) => ({
      name: p.name, category: p.category,
      price: p.price, originalPrice: p.originalPrice ?? '',
      cost: p.cost, stock: p.stock, reorderLevel: p.reorderLevel,
      barcode: p.barcode || '', sku: p.sku || '', location: p.location || '',
      description: p.description || '', badge: p.badge || '',
    }));
    downloadCsv(`items-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, ITEM_CSV_HEADERS));
    toast.success(`Exported ${rows.length} items`);
  };

  const downloadTemplate = () => {
    downloadCsv('items-template.csv', toCsv([], ITEM_CSV_HEADERS));
  };

  const importCsv = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) return toast.error('CSV is empty');
      const errors: string[] = [];
      const incoming: Product[] = [];
      rows.forEach((r, idx) => {
        const lineNo = idx + 2;
        if (!r.name) { errors.push(`Row ${lineNo}: name is required`); return; }
        if (!r.category) { errors.push(`Row ${lineNo}: category is required`); return; }
        const num = (k: string) => r[k] === undefined || r[k] === '' ? 0 : Number(r[k]);
        if (Number.isNaN(num('price'))) { errors.push(`Row ${lineNo}: price must be a number`); return; }
        if (Number.isNaN(num('cost'))) { errors.push(`Row ${lineNo}: cost must be a number`); return; }
        const matchById = r.id && products.find((p) => p.id === r.id);
        const matchByBarcode = !matchById && r.barcode && products.find((p) => (p.barcode || '') === r.barcode);
        const matchByName = !matchById && !matchByBarcode && products.find((p) => p.name.toLowerCase() === r.name.toLowerCase());
        const existing = matchById || matchByBarcode || matchByName;
        incoming.push({
          id: existing?.id || uid(),
          name: r.name,
          category: r.category,
          price: num('price'),
          originalPrice: r.originalPrice ? num('originalPrice') : undefined,
          cost: num('cost'),
          stock: num('stock'),
          reorderLevel: num('reorderLevel'),
          barcode: r.barcode || '',
          sku: r.sku || '',
          location: r.location || '',
          description: r.description || '',
          badge: r.badge || '',
          imageUrl: existing?.imageUrl || '',
          vendorId: existing?.vendorId || '',
        });
      });
      if (errors.length) {
        toast.error(`${errors.length} error(s). First: ${errors[0]}`);
        if (errors.length > 1) console.warn('CSV import errors', errors);
        return;
      }
      const merged = [...products];
      incoming.forEach((p) => {
        const idx = merged.findIndex((x) => x.id === p.id);
        if (idx === -1) merged.push(p); else merged[idx] = p;
      });
      setProducts(merged);
      toast.success(`Imported ${incoming.length} items`);
    } catch (err: any) {
      toast.error(err?.message || 'CSV import failed');
    }
  };


  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-semibold mb-3">{form.id ? 'Edit Item' : 'Add New Item'}</h4>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Item Name *" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          <select
            className="h-10 px-3 rounded-md border bg-background text-sm"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            required
          >
            <option value="">Select category *</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input type="number" placeholder="Sale Price" value={form.price || ''} onChange={(e) => set('price', Number(e.target.value))} />
          <Input type="number" placeholder="Cost" value={form.cost || ''} onChange={(e) => set('cost', Number(e.target.value))} />
          <Input type="number" placeholder="Stock Qty" value={form.stock || ''} onChange={(e) => set('stock', Number(e.target.value))} />
          <Input type="number" placeholder="Reorder Level" value={form.reorderLevel || ''} onChange={(e) => set('reorderLevel', Number(e.target.value))} />
          <Input placeholder="Badge (e.g. Sale / New)" maxLength={12} value={form.badge || ''} onChange={(e) => set('badge', e.target.value)} />
          <BarcodeInput value={form.barcode || ''} onChange={(v) => set('barcode', v)} placeholder="Barcode" />
          <Input placeholder="SKU / Item Code" value={form.sku || ''} onChange={(e) => set('sku', e.target.value)} />
          <Input type="number" placeholder="Original Price" value={form.originalPrice || ''} onChange={(e) => set('originalPrice', Number(e.target.value))} />
          <select
            className="h-10 px-3 rounded-md border bg-background text-sm"
            value={form.vendorId || ''}
            onChange={(e) => set('vendorId', e.target.value)}
          >
            <option value="">No supplier</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <Input placeholder="Location (Shelf A-3)" value={form.location || ''} onChange={(e) => set('location', e.target.value)} />
          <Input placeholder="Image URL" value={form.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} className="md:col-span-2" />
          <Textarea placeholder="Description" value={form.description || ''} onChange={(e) => set('description', e.target.value)} className="md:col-span-2" rows={2} />
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">{form.id ? 'Update' : 'Save'} Item</Button>
            <Button type="button" variant="outline" onClick={() => setForm(empty)}>Reset</Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h4 className="font-semibold">All Items ({products.length})</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <Input placeholder="Search items..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button size="sm" variant="outline" onClick={printList}>
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="w-3.5 h-3.5 mr-1" /> Export
            </Button>
            <Button size="sm" variant="outline" onClick={importCsv}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Import
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadTemplate} title="Download blank CSV template">
              <FileText className="w-3.5 h-3.5 mr-1" /> Template
            </Button>
          </div>
        </div>
        {search ? (
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
            {filtered.map((p) => (
              <ItemRow key={p.id} p={p} formatPrice={formatPrice} onEdit={setForm} onDelete={deleteProduct} />
            ))}
          </div>
        ) : (
          <SortableList
            className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1"
            items={products}
            getId={(p) => p.id}
            onReorder={setProducts}
            renderItem={(p) => (
              <ItemRow p={p} formatPrice={formatPrice} onEdit={setForm} onDelete={deleteProduct} />
            )}
          />
        )}
      </Card>
    </div>
  );
}

function ItemRow({
  p,
  formatPrice,
  onEdit,
  onDelete,
}: {
  p: Product;
  formatPrice: (n: number) => string;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 hover:bg-muted">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{p.name}</p>
        <p className="text-xs text-muted-foreground">
          {p.category} · Stock: {p.stock} · {formatPrice(p.price)}
          {p.sku ? ` · SKU ${p.sku}` : ''}
          {p.barcode ? ` · ⌗ ${p.barcode}` : ''}
        </p>
      </div>
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(p)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive"
          onClick={() => {
            if (confirm(`Delete ${p.name}?`)) {
              onDelete(p.id);
              toast.success('Item deleted');
            }
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
