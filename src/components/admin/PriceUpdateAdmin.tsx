import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileText, FileSpreadsheet, Loader2, Wand2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { extractPdfPrices, normalizeModel } from '@/lib/pdfParse';
import { Product } from '@/types';

interface SupplierRow {
  key: string;       // normalized model/barcode
  rawKey: string;    // original
  name?: string;
  price: number;
  source: string;    // file name / page
}

interface MatchRow {
  supplier: SupplierRow;
  product?: Product;
  matchBy?: 'barcode' | 'sku' | 'model';
  newCost: number;       // editable
  newPrice: number;      // editable (sale price)
  oldCost: number;
  oldPrice: number;
  selected: boolean;
}

const toNum = (s: any): number | null => {
  if (s === null || s === undefined) return null;
  const str = String(s).replace(/[^0-9.,\-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const n = Number(str.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function parseSheetRows(ws: XLSX.WorkSheet, sourceName: string): SupplierRow[] {
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: false });
  if (json.length === 0) return [];
  const headers = Object.keys(json[0]).map((h) => h.toLowerCase());

  // Find likely columns
  const findCol = (...keys: string[]) =>
    Object.keys(json[0]).find((h) => keys.some((k) => h.toLowerCase().includes(k)));

  const modelCol = findCol('barcode', 'model', 'mpn', 'sku', 'code', 'part', 'item no', 'item code');
  const nameCol = findCol('name', 'description', 'item', 'product');
  const priceCol = findCol('wholesale', 'price', 'cost', 'rate', 'unit');

  const out: SupplierRow[] = [];
  for (const row of json) {
    let rawKey = '';
    if (modelCol) rawKey = String(row[modelCol] || '').trim();
    // Fallback: scan all cells for a model-like token
    if (!rawKey) {
      for (const v of Object.values(row)) {
        const s = String(v || '').trim();
        if (/^[A-Z0-9][A-Z0-9\-./]{3,}$/i.test(s)) { rawKey = s; break; }
      }
    }
    const price = priceCol ? toNum(row[priceCol]) : null;
    let realPrice = price;
    if (!realPrice) {
      // pick the largest numeric in the row
      const nums = Object.values(row).map(toNum).filter((n): n is number => n !== null);
      if (nums.length) realPrice = Math.max(...nums);
    }
    const key = normalizeModel(rawKey);
    if (!rawKey || key.length < 3 || !realPrice) continue;
    out.push({
      key,
      rawKey,
      name: nameCol ? String(row[nameCol] || '') : undefined,
      price: realPrice,
      source: sourceName,
    });
  }
  return out;
}

async function parseExcelFile(file: File): Promise<SupplierRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const all: SupplierRow[] = [];
  for (const name of wb.SheetNames) {
    all.push(...parseSheetRows(wb.Sheets[name], `${file.name}:${name}`));
  }
  // Dedup by key — keep first
  const seen = new Map<string, SupplierRow>();
  for (const r of all) if (!seen.has(r.key)) seen.set(r.key, r);
  return [...seen.values()];
}

async function parseFile(file: File): Promise<SupplierRow[]> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const rows = await extractPdfPrices(file);
    return rows.map((r) => ({
      key: r.model,
      rawKey: r.rawModel,
      name: r.description,
      price: r.price,
      source: `${file.name}:p${r.pageNumber}`,
    }));
  }
  // xlsx, xls, csv
  return parseExcelFile(file);
}

export function PriceUpdateAdmin() {
  const { products, upsertProduct, formatPrice } = useStore();
  const [files, setFiles] = useState<File[]>([]);
  const [supplier, setSupplier] = useState<SupplierRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [keepMarkup, setKeepMarkup] = useState(true);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [rows, setRows] = useState<MatchRow[]>([]);

  // Product index by barcode / sku / normalized name
  const productIndex = useMemo(() => {
    const byBarcode = new Map<string, Product>();
    const bySku = new Map<string, Product>();
    const byModel = new Map<string, Product>();
    for (const p of products) {
      if (p.barcode) byBarcode.set(normalizeModel(p.barcode), p);
      if (p.sku) bySku.set(normalizeModel(p.sku), p);
      const n = normalizeModel(p.name);
      if (n.length >= 4 && !byModel.has(n)) byModel.set(n, p);
    }
    return { byBarcode, bySku, byModel };
  }, [products]);

  const matchProduct = (key: string): { product?: Product; how?: MatchRow['matchBy'] } => {
    if (productIndex.byBarcode.has(key)) return { product: productIndex.byBarcode.get(key), how: 'barcode' };
    if (productIndex.bySku.has(key)) return { product: productIndex.bySku.get(key), how: 'sku' };
    if (productIndex.byModel.has(key)) return { product: productIndex.byModel.get(key), how: 'model' };
    // partial: longest containment
    for (const [k, p] of productIndex.byBarcode) if (k.includes(key) || key.includes(k)) return { product: p, how: 'barcode' };
    for (const [k, p] of productIndex.bySku) if (k.includes(key) || key.includes(k)) return { product: p, how: 'sku' };
    return {};
  };

  const buildRows = (sup: SupplierRow[]): MatchRow[] =>
    sup.map((s) => {
      const { product, how } = matchProduct(s.key);
      const oldCost = product?.cost ?? 0;
      const oldPrice = product?.price ?? 0;
      const markup = oldCost > 0 ? oldPrice / oldCost : 1.3;
      const newCost = s.price;
      const newPrice = product
        ? (keepMarkup && oldCost > 0 ? Math.round(newCost * markup) : oldPrice)
        : Math.round(s.price * 1.3);
      return {
        supplier: s,
        product,
        matchBy: how,
        oldCost, oldPrice,
        newCost, newPrice,
        selected: !!product,
      };
    });

  const analyze = async () => {
    if (files.length === 0) { toast.error('Wholesale file (PDF/Excel) ရွေးပါ'); return; }
    setBusy(true);
    try {
      const all: SupplierRow[] = [];
      for (const f of files) {
        try {
          const rows = await parseFile(f);
          all.push(...rows);
        } catch (e: any) {
          toast.error(`${f.name}: ${e?.message || 'parse error'}`);
        }
      }
      const seen = new Map<string, SupplierRow>();
      for (const r of all) if (!seen.has(r.key)) seen.set(r.key, r);
      const merged = [...seen.values()];
      setSupplier(merged);
      setRows(buildRows(merged));
      toast.success(`${merged.length} ဈေးနှုန်း row ဖတ်ပြီးပါပြီ`);
    } finally {
      setBusy(false);
    }
  };

  // Rebuild rows when keepMarkup toggles (preserve edits is tricky; just rebuild)
  const rebuild = () => setRows(buildRows(supplier));

  const visible = useMemo(() => {
    if (!onlyChanged) return rows;
    return rows.filter((r) => !r.product || Math.abs(r.newCost - r.oldCost) > 0.5);
  }, [rows, onlyChanged]);

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.product).length;
    const up = rows.filter((r) => r.product && r.newCost > r.oldCost + 0.5).length;
    const down = rows.filter((r) => r.product && r.newCost < r.oldCost - 0.5).length;
    const noMatch = rows.filter((r) => !r.product).length;
    return { matched, up, down, noMatch };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<MatchRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const apply = () => {
    const targets = rows.filter((r) => r.selected && r.product);
    if (targets.length === 0) { toast.info('Apply ရန် ရွေးထားသော item မရှိပါ'); return; }
    let n = 0;
    for (const t of targets) {
      upsertProduct({ ...t.product!, cost: t.newCost, price: t.newPrice });
      n++;
    }
    toast.success(`${n} item ၏ ဈေးနှုန်းကို update လုပ်ပြီးပါပြီ`);
  };

  const toggleAll = (v: boolean) => setRows((prev) => prev.map((r) => ({ ...r, selected: v && !!r.product })));

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-transparent">
        <h3 className="font-semibold flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" /> Wholesale Price Update
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Wholesale ပို့တဲ့ PDF / Excel ဖိုင်တွေထည့်ပါ — barcode / model နံပါတ်နဲ့ တိုက်ပြီး ဈေးနှုန်း update လုပ်ပါ။
        </p>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Wholesale Files (PDF / XLSX / XLS / CSV) — multiple ထည့်လို့ရ
          </Label>
          <input
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,application/pdf"
            className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              setFiles(list);
              setSupplier([]); setRows([]);
            }}
          />
          {files.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-1">
                  {f.name.toLowerCase().endsWith('.pdf') ? <FileText className="w-3 h-3" /> : <FileSpreadsheet className="w-3 h-3" />}
                  {f.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={analyze} disabled={busy || files.length === 0}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
            Analyze & Match
          </Button>
          <Button variant="secondary" onClick={apply} disabled={rows.filter((r) => r.selected).length === 0}>
            Apply Selected ({rows.filter((r) => r.selected).length})
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={keepMarkup} onCheckedChange={(v) => { setKeepMarkup(!!v); setTimeout(rebuild, 0); }} />
            Markup % အတိုင်း sale price ပြောင်း
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={onlyChanged} onCheckedChange={(v) => setOnlyChanged(!!v)} />
            ပြောင်းတဲ့ item တွေပဲ ပြ
          </label>
        </div>
      </Card>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Matched" value={stats.matched} tone="success" />
          <Stat label="ဈေးတက်" value={stats.up} tone="warning" />
          <Stat label="ဈေးကျ" value={stats.down} tone="primary" />
          <Stat label="No match" value={stats.noMatch} tone="muted" />
        </div>
      )}

      {visible.length > 0 && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.length > 0 && rows.every((r) => r.selected || !r.product)}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Code / Model</TableHead>
                <TableHead className="text-right">Old Cost</TableHead>
                <TableHead className="text-right">New Cost</TableHead>
                <TableHead className="text-right">Old Price</TableHead>
                <TableHead className="text-right">New Price</TableHead>
                <TableHead>Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.slice(0, 300).map((r) => {
                const idx = rows.indexOf(r);
                const diff = r.newCost - r.oldCost;
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      <Checkbox
                        checked={r.selected}
                        disabled={!r.product}
                        onCheckedChange={(v) => updateRow(idx, { selected: !!v })}
                      />
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium">{r.product?.name || r.supplier.name || '—'}</div>
                      {!r.product && <Badge variant="outline" className="mt-1">No item</Badge>}
                      {r.matchBy && <span className="text-[10px] text-muted-foreground uppercase">by {r.matchBy}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.supplier.rawKey}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.product ? formatPrice(r.oldCost) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="h-8 w-24 text-right ml-auto"
                        value={r.newCost}
                        onChange={(e) => {
                          const c = Number(e.target.value) || 0;
                          const markup = r.oldCost > 0 ? r.oldPrice / r.oldCost : 1.3;
                          updateRow(idx, { newCost: c, newPrice: keepMarkup ? Math.round(c * markup) : r.newPrice });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.product ? formatPrice(r.oldPrice) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="h-8 w-24 text-right ml-auto"
                        value={r.newPrice}
                        onChange={(e) => updateRow(idx, { newPrice: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      {!r.product ? <Minus className="w-4 h-4 text-muted-foreground" />
                        : diff > 0.5 ? <span className="flex items-center gap-1 text-destructive"><TrendingUp className="w-4 h-4" />{formatPrice(diff)}</span>
                        : diff < -0.5 ? <span className="flex items-center gap-1 text-emerald-600"><TrendingDown className="w-4 h-4" />{formatPrice(Math.abs(diff))}</span>
                        : <Minus className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {visible.length > 300 && (
            <p className="text-xs text-muted-foreground p-3">Showing first 300 of {visible.length} rows.</p>
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
