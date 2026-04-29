import { useMemo, useRef, useState } from 'react';
import { useStore, uid } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Bot, FileSpreadsheet, FileText, Loader2, RefreshCw, Wand2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { parseCsv, CsvRow } from '@/lib/csv';
import { extractPdfPrices, normalizeModel, PdfPriceRow } from '@/lib/pdfParse';
import { Product, PurchaseOrder } from '@/types';

interface DominusItem {
  itemName: string;
  vendor: string;
  cost: number;
  price: number;
  qty: number;
  reorder: number;
  mpn: string;
  mpnNorm: string;
}

interface CompareRow {
  csv: DominusItem;
  product?: Product;
  pdf?: PdfPriceRow;
  newCost?: number;
  changed: boolean;
  needsRestock: boolean;
}

const num = (s: string | undefined) => {
  if (!s) return 0;
  const cleaned = String(s).replace(/[^\d.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

// CSV column resolver — tolerant to header naming differences.
function pick(row: CsvRow, keys: string[]): string {
  const lc: Record<string, string> = {};
  for (const k of Object.keys(row)) lc[k.toLowerCase().trim()] = row[k];
  for (const k of keys) {
    const v = lc[k.toLowerCase()];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

function parseDominusItems(rows: CsvRow[]): DominusItem[] {
  const out: DominusItem[] = [];
  for (const r of rows) {
    const vendor = pick(r, ['Preferred Vendor', 'Vendor', 'Preferred vendor']);
    if (!/dominus/i.test(vendor)) continue;
    const itemName = pick(r, ['Item', 'Item Name', 'Name', 'Description']);
    const mpn = pick(r, ['MPN', 'Manufacturer Part Number', 'Mfr Part #', 'Part #']);
    if (!itemName && !mpn) continue;
    out.push({
      itemName,
      vendor,
      cost: num(pick(r, ['Cost', 'Purchase Cost', 'Avg Cost', 'Average Cost'])),
      price: num(pick(r, ['Price', 'Sales Price', 'Sale Price'])),
      qty: num(pick(r, ['Quantity On Hand', 'Qty On Hand', 'On Hand', 'Stock', 'Quantity'])),
      reorder: num(pick(r, ['Reorder Pt (Min)', 'Reorder Point', 'Reorder', 'Min'])),
      mpn,
      mpnNorm: normalizeModel(mpn || itemName),
    });
  }
  return out;
}

export function VendorPriceBotAdmin() {
  const { products, upsertProduct, upsertPurchase, vendors, formatPrice } = useStore();

  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [csvItems, setCsvItems] = useState<DominusItem[]>([]);
  const [pdfRows, setPdfRows] = useState<PdfPriceRow[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [keepMarkup, setKeepMarkup] = useState(true);

  // Build a lookup of products by normalized MPN/SKU/barcode/name fragment.
  const productIndex = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      const candidates = [p.sku, p.barcode, p.name].filter(Boolean) as string[];
      for (const c of candidates) {
        const n = normalizeModel(c);
        if (n.length >= 4 && !map.has(n)) map.set(n, p);
      }
    }
    return map;
  }, [products]);

  const compare: CompareRow[] = useMemo(() => {
    if (csvItems.length === 0) return [];
    const pdfMap = new Map<string, PdfPriceRow>();
    for (const r of pdfRows) pdfMap.set(r.model, r);

    return csvItems.map((csv) => {
      // Try exact, then progressively shorter prefixes/suffixes for robustness.
      const key = csv.mpnNorm;
      let pdf = pdfMap.get(key);
      if (!pdf && key.length > 5) {
        for (const [k, v] of pdfMap) {
          if (k.endsWith(key) || key.endsWith(k) || k.includes(key) || key.includes(k)) {
            pdf = v; break;
          }
        }
      }
      const product = productIndex.get(csv.mpnNorm);
      const newCost = pdf?.price;
      const baseCost = product?.cost ?? csv.cost;
      const changed = !!(newCost && Math.abs(newCost - baseCost) > 0.0001);
      const needsRestock = csv.qty <= csv.reorder;
      return { csv, product, pdf, newCost, changed, needsRestock };
    });
  }, [csvItems, pdfRows, productIndex]);

  const stats = useMemo(() => ({
    totalCsv: csvItems.length,
    matchedPdf: compare.filter((c) => c.pdf).length,
    changed: compare.filter((c) => c.changed).length,
    lowStock: compare.filter((c) => c.needsRestock).length,
    noPdf: compare.filter((c) => !c.pdf).length,
    noProduct: compare.filter((c) => !c.product).length,
  }), [compare, csvItems]);

  const onCsvPick = (f: File | null) => {
    if (!f) return;
    setCsvFile(f);
    setCsvItems([]);
  };
  const onPdfPick = (f: File | null) => {
    if (!f) return;
    setPdfFile(f);
    setPdfRows([]);
  };

  const importItemsFromCsv = async () => {
    if (!csvFile) { toast.error('CSV file မရွေးရသေးပါ'); return; }
    try {
      const text = await csvFile.text();
      const rows = parseCsv(text);
      const items = parseDominusItems(rows);
      setCsvItems(items);
      if (items.length === 0) toast.warning('Dominus vendor row မတွေ့ပါ');
      else toast.success(`Dominus items ${items.length} ခု import ပြီးပါပြီ`);
    } catch (e) {
      console.error(e);
      toast.error('CSV ဖတ်၍မရပါ — ဖိုင်ကို စစ်ပေးပါ');
    }
  };

  const analyze = async () => {
    if (!csvFile) { toast.error('CSV file မရွေးရသေးပါ'); return; }
    if (!pdfFile) { toast.error('PDF file မရွေးရသေးပါ'); return; }
    setAnalyzing(true);
    try {
      // Always re-parse so users can correct a swapped pick by re-selecting.
      const csvText = await csvFile.text();
      const items = parseDominusItems(parseCsv(csvText));
      setCsvItems(items);

      const pdf = await extractPdfPrices(pdfFile);
      setPdfRows(pdf);

      if (items.length === 0) {
        toast.error('CSV ထဲတွင် Dominus rows မတွေ့ပါ — ဖိုင် swap ဖြစ်နေသလား စစ်ပါ');
      } else if (pdf.length === 0) {
        toast.error('PDF ထဲမှ ဈေးနှုန်း မထုတ်နိုင်ပါ — ဖိုင် swap ဖြစ်နေသလား စစ်ပါ');
      } else {
        toast.success(`Analyzed: ${items.length} CSV · ${pdf.length} PDF rows`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`CSV/PDF analyze မအောင်မြင်ပါ: ${e?.message || e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyPriceUpdates = () => {
    const targets = compare.filter((c) => c.changed && c.product && c.newCost);
    if (targets.length === 0) { toast.info('ပြောင်းရန် ဈေးနှုန်း မရှိပါ'); return; }
    let n = 0;
    for (const t of targets) {
      const p = t.product!;
      const oldCost = p.cost || 1;
      const oldPrice = p.price || 0;
      const markup = oldCost > 0 ? oldPrice / oldCost : 1;
      const newCost = t.newCost!;
      const newPrice = keepMarkup ? Math.round(newCost * markup) : oldPrice;
      upsertProduct({ ...p, cost: newCost, price: newPrice });
      n++;
    }
    toast.success(`Price updated: ${n} items`);
  };

  const createPurchaseOrder = () => {
    const targets = compare.filter((c) => c.needsRestock && c.product);
    if (targets.length === 0) { toast.info('Low stock item မရှိပါ'); return; }
    const dominusVendor = vendors.find((v) => /dominus/i.test(v.name));
    const po: PurchaseOrder = {
      id: uid(),
      vendorName: dominusVendor?.name || 'Dominus',
      status: 'ordered',
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: '',
      lines: targets.map((t) => {
        const p = t.product!;
        const reorderQty = Math.max(t.csv.reorder - t.csv.qty, t.csv.reorder, 1);
        return {
          itemName: p.name,
          orderedQty: reorderQty,
          receivedQty: 0,
          cost: t.newCost ?? p.cost ?? t.csv.cost,
        };
      }),
      note: `Auto-generated from Vendor Price Bot · ${targets.length} items`,
    };
    upsertPurchase(po);
    toast.success(`Purchase Order created (${targets.length} items)`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center gap-3 bg-gradient-to-r from-primary/10 to-transparent">
        <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold">Vendor Price Bot</h3>
          <p className="text-xs text-muted-foreground">Dominus CSV နှင့် Hoteche Wholesale PDF ကို နှိုင်းယှဉ်ပြီး ဈေးနှုန်းနှင့် stock update လုပ်ပါ</p>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Dominus Items CSV</Label>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
              onChange={(e) => onCsvPick(e.target.files?.[0] ?? null)}
            />
            {csvFile && <p className="text-xs text-muted-foreground truncate">📄 {csvFile.name}</p>}
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><FileText className="w-4 h-4" /> Hoteche Wholesale PDF</Label>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
              onChange={(e) => onPdfPick(e.target.files?.[0] ?? null)}
            />
            {pdfFile && <p className="text-xs text-muted-foreground truncate">📄 {pdfFile.name}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={importItemsFromCsv} disabled={!csvFile || analyzing}>
            <RefreshCw className="w-4 h-4 mr-1" /> Import / Refresh Items
          </Button>
          <Button onClick={analyze} disabled={!csvFile || !pdfFile || analyzing}>
            {analyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Bot className="w-4 h-4 mr-1" />}
            Analyze CSV + PDF
          </Button>
          <Button variant="secondary" onClick={applyPriceUpdates} disabled={stats.changed === 0}>
            <Wand2 className="w-4 h-4 mr-1" /> Apply Price Updates
          </Button>
          <Button variant="secondary" onClick={createPurchaseOrder} disabled={stats.lowStock === 0}>
            <ShoppingCart className="w-4 h-4 mr-1" /> Create Purchase Order
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={keepMarkup} onCheckedChange={(v) => setKeepMarkup(!!v)} />
          Keep same markup % when updating sale price
        </label>
      </Card>

      {csvItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Dominus rows" value={stats.totalCsv} />
          <Stat label="Matched PDF" value={stats.matchedPdf} tone="success" />
          <Stat label="Price changes" value={stats.changed} tone="primary" />
          <Stat label="Low / Out of stock" value={stats.lowStock} tone="warning" />
          <Stat label="No PDF match" value={stats.noPdf} tone="muted" />
          <Stat label="Missing inventory" value={stats.noProduct} tone="muted" />
        </div>
      )}

      {compare.length > 0 && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>MPN</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Current Cost</TableHead>
                <TableHead className="text-right">PDF Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compare.slice(0, 200).map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-[280px] truncate">{c.csv.itemName}</TableCell>
                  <TableCell className="font-mono text-xs">{c.csv.mpn}</TableCell>
                  <TableCell className="text-right">{c.csv.qty} / {c.csv.reorder}</TableCell>
                  <TableCell className="text-right">{formatPrice(c.product?.cost ?? c.csv.cost)}</TableCell>
                  <TableCell className="text-right">{c.pdf ? formatPrice(c.pdf.price) : '—'}</TableCell>
                  <TableCell className="space-x-1">
                    {!c.product && <Badge variant="outline">No item</Badge>}
                    {!c.pdf && <Badge variant="outline">No PDF</Badge>}
                    {c.changed && <Badge>Price ↻</Badge>}
                    {c.needsRestock && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Restock</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {compare.length > 200 && (
            <p className="text-xs text-muted-foreground p-3">Showing first 200 of {compare.length} rows.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'primary' | 'muted' }) {
  const cls =
    tone === 'success' ? 'text-emerald-600' :
    tone === 'warning' ? 'text-destructive' :
    tone === 'primary' ? 'text-primary' :
    'text-muted-foreground';
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${cls}`}>{value}</p>
    </Card>
  );
}
