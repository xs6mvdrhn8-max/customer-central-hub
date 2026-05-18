import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { FileText, FileSpreadsheet, Loader2, Wand2, TrendingUp, TrendingDown, Minus, AlertTriangle, Undo2, ShieldCheck, History } from 'lucide-react';
import { toast } from 'sonner';
import { extractPdfPrices, normalizeModel } from '@/lib/pdfParse';
import { Product } from '@/types';

interface SupplierRow {
  key: string;
  rawKey: string;
  name?: string;
  price: number;
  source: string;
}

type MatchConfidence = 'exact' | 'partial' | 'none';
type MatchBy = 'barcode' | 'sku' | 'model';

interface MatchRow {
  supplier: SupplierRow;
  product?: Product;
  matchBy?: MatchBy;
  confidence: MatchConfidence;
  newCost: number;
  newPrice: number;
  oldCost: number;
  oldPrice: number;
  selected: boolean;
  /** % change vs old cost (absolute) — used to flag suspicious jumps */
  costJumpPct: number;
  warning?: string;
}

interface HistoryEntry {
  id: string;
  appliedAt: string;
  note: string;
  changes: {
    productId: string;
    name: string;
    prevCost: number;
    prevPrice: number;
    newCost: number;
    newPrice: number;
  }[];
}

const HISTORY_KEY = 'price-update-history-v1';
const SUSPICIOUS_JUMP_PCT = 50; // flag if ≥ 50% change

const toNum = (s: any): number | null => {
  if (s === null || s === undefined) return null;
  const str = String(s).replace(/[^0-9.,\-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const n = Number(str.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function parseSheetRows(ws: ExcelJS.Worksheet, sourceName: string): SupplierRow[] {
  // Build array of row objects keyed by the header row (row 1).
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
  if (headers.filter(Boolean).length === 0) return [];

  const json: Record<string, any>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, any> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const h = headers[colNumber];
      if (!h) return;
      const v: any = cell.value;
      // Flatten rich-text/formula/hyperlink values to plain text/number.
      if (v && typeof v === 'object') {
        if ('result' in v) obj[h] = (v as any).result;
        else if ('text' in v) obj[h] = (v as any).text;
        else if ('richText' in v) obj[h] = (v as any).richText.map((p: any) => p.text).join('');
        else if ('hyperlink' in v) obj[h] = (v as any).text ?? (v as any).hyperlink;
        else obj[h] = String(v);
      } else {
        obj[h] = v;
      }
    });
    json.push(obj);
  });
  if (json.length === 0) return [];

  const findCol = (...keys: string[]) =>
    Object.keys(json[0]).find((h) => keys.some((k) => h.toLowerCase().includes(k)));

  const modelCol = findCol('barcode', 'model', 'mpn', 'sku', 'code', 'part', 'item no', 'item code');
  const nameCol = findCol('name', 'description', 'item', 'product');
  const priceCol = findCol('wholesale', 'price', 'cost', 'rate', 'unit');

  const out: SupplierRow[] = [];
  for (const row of json) {
    let rawKey = '';
    if (modelCol) rawKey = String(row[modelCol] || '').trim();
    if (!rawKey) {
      for (const v of Object.values(row)) {
        const s = String(v || '').trim();
        if (/^[A-Z0-9][A-Z0-9\-./]{3,}$/i.test(s)) { rawKey = s; break; }
      }
    }
    const price = priceCol ? toNum(row[priceCol]) : null;
    let realPrice = price;
    if (!realPrice) {
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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const all: SupplierRow[] = [];
  wb.eachSheet((ws) => {
    all.push(...parseSheetRows(ws, `${file.name}:${ws.name}`));
  });
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
  return parseExcelFile(file);
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(h: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20))); } catch { /* ignore */ }
}

export function PriceUpdateAdmin() {
  const { products, upsertProduct, formatPrice } = useStore();
  const [files, setFiles] = useState<File[]>([]);
  const [supplier, setSupplier] = useState<SupplierRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [keepMarkup, setKeepMarkup] = useState(true);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [hideUnmatched, setHideUnmatched] = useState(false);
  const [strictMatch, setStrictMatch] = useState(true);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  useEffect(() => { saveHistory(history); }, [history]);

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

  const matchProduct = (key: string): { product?: Product; how?: MatchBy; confidence: MatchConfidence } => {
    if (productIndex.byBarcode.has(key)) return { product: productIndex.byBarcode.get(key), how: 'barcode', confidence: 'exact' };
    if (productIndex.bySku.has(key)) return { product: productIndex.bySku.get(key), how: 'sku', confidence: 'exact' };
    if (productIndex.byModel.has(key)) return { product: productIndex.byModel.get(key), how: 'model', confidence: 'exact' };
    if (strictMatch) return { confidence: 'none' };
    // partial fallback (off by default — fuzzy matches cause wrong-price bugs)
    for (const [k, p] of productIndex.byBarcode) if (k.length >= 5 && (k.endsWith(key) || key.endsWith(k))) return { product: p, how: 'barcode', confidence: 'partial' };
    for (const [k, p] of productIndex.bySku) if (k.length >= 5 && (k.endsWith(key) || key.endsWith(k))) return { product: p, how: 'sku', confidence: 'partial' };
    return { confidence: 'none' };
  };

  const buildRows = (sup: SupplierRow[]): MatchRow[] =>
    sup.map((s) => {
      const { product, how, confidence } = matchProduct(s.key);
      const oldCost = product?.cost ?? 0;
      const oldPrice = product?.price ?? 0;
      const markup = oldCost > 0 ? oldPrice / oldCost : 1.3;
      const newCost = s.price;
      const newPrice = product
        ? (keepMarkup && oldCost > 0 ? Math.round(newCost * markup) : oldPrice)
        : Math.round(s.price * 1.3);
      const costJumpPct = oldCost > 0 ? Math.abs((newCost - oldCost) / oldCost) * 100 : 0;
      let warning: string | undefined;
      if (product && oldCost > 0 && costJumpPct >= SUSPICIOUS_JUMP_PCT) {
        warning = `ဈေးနှုန်း ${costJumpPct.toFixed(0)}% ပြောင်းနေ — ပြန်စစ်ပါ`;
      }
      if (confidence === 'partial') {
        warning = (warning ? warning + ' · ' : '') + 'Partial match — code တိုက်စစ်ပါ';
      }
      return {
        supplier: s,
        product,
        matchBy: how,
        confidence,
        oldCost, oldPrice,
        newCost, newPrice,
        // Auto-select only exact matches without warnings
        selected: !!product && confidence === 'exact' && !warning,
        costJumpPct,
        warning,
      };
    });

  const analyze = async () => {
    if (files.length === 0) { toast.error('Wholesale file (PDF/Excel) ရွေးပါ'); return; }
    setBusy(true);
    try {
      const all: SupplierRow[] = [];
      for (const f of files) {
        try {
          const rs = await parseFile(f);
          all.push(...rs);
        } catch (e: any) {
          toast.error(`${f.name}: ${e?.message || 'parse error'}`);
        }
      }
      const seen = new Map<string, SupplierRow>();
      for (const r of all) if (!seen.has(r.key)) seen.set(r.key, r);
      const merged = [...seen.values()];
      setSupplier(merged);
      setRows(buildRows(merged));
      toast.success(`${merged.length} ဈေးနှုန်း row ဖတ်ပြီးပါပြီ — Apply မလုပ်ခင် preview စစ်ပါ`);
    } finally {
      setBusy(false);
    }
  };

  const rebuild = () => setRows(buildRows(supplier));
  // Rebuild when strict match toggles, so partial matches re-evaluate
  useEffect(() => { if (supplier.length) rebuild(); /* eslint-disable-next-line */ }, [strictMatch]);

  const visible = useMemo(() => {
    let v = rows;
    if (hideUnmatched) v = v.filter((r) => r.product);
    if (onlyChanged) v = v.filter((r) => !r.product || Math.abs(r.newCost - r.oldCost) > 0.5);
    return v;
  }, [rows, onlyChanged, hideUnmatched]);

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.product).length;
    const up = rows.filter((r) => r.product && r.newCost > r.oldCost + 0.5).length;
    const down = rows.filter((r) => r.product && r.newCost < r.oldCost - 0.5).length;
    const noMatch = rows.filter((r) => !r.product).length;
    const warnings = rows.filter((r) => r.warning).length;
    const partial = rows.filter((r) => r.confidence === 'partial').length;
    return { matched, up, down, noMatch, warnings, partial };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<MatchRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const selectedTargets = useMemo(
    () => rows.filter((r) => r.selected && r.product),
    [rows],
  );

  const openConfirm = () => {
    if (selectedTargets.length === 0) { toast.info('Apply ရန် ရွေးထားသော item မရှိပါ'); return; }
    setConfirmOpen(true);
  };

  const apply = () => {
    if (selectedTargets.length === 0) { setConfirmOpen(false); return; }
    const entry: HistoryEntry = {
      id: `${Date.now()}`,
      appliedAt: new Date().toISOString(),
      note: files.map((f) => f.name).join(', ') || 'manual',
      changes: selectedTargets.map((t) => ({
        productId: t.product!.id,
        name: t.product!.name,
        prevCost: t.oldCost,
        prevPrice: t.oldPrice,
        newCost: t.newCost,
        newPrice: t.newPrice,
      })),
    };
    for (const t of selectedTargets) {
      upsertProduct({ ...t.product!, cost: t.newCost, price: t.newPrice });
    }
    setHistory((h) => [entry, ...h]);
    setConfirmOpen(false);
    toast.success(`${selectedTargets.length} item update လုပ်ပြီး — လိုအပ်ရင် Undo နှိပ်ပါ`);
  };

  const rollback = (entry: HistoryEntry) => {
    const map = new Map(products.map((p) => [p.id, p]));
    let n = 0;
    for (const c of entry.changes) {
      const p = map.get(c.productId);
      if (!p) continue;
      upsertProduct({ ...p, cost: c.prevCost, price: c.prevPrice });
      n++;
    }
    setHistory((h) => h.filter((e) => e.id !== entry.id));
    toast.success(`${n} item ကို rollback လုပ်ပြီးပါပြီ`);
  };

  const toggleAll = (v: boolean) =>
    setRows((prev) => prev.map((r) => ({
      ...r,
      selected: v && !!r.product && r.confidence === 'exact' && !r.warning,
    })));

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> Wholesale Price Update
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Wholesale PDF / Excel ဖိုင်ထည့်ပါ — barcode / model နဲ့တိုက်ပြီး ဈေးနှုန်း update လုပ်ပါ။ Apply မလုပ်ခင် preview ပေါ်လာပါမယ်။
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="w-4 h-4 mr-1" /> History ({history.length})
          </Button>
        </div>
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
          <Button variant="secondary" onClick={openConfirm} disabled={selectedTargets.length === 0}>
            <ShieldCheck className="w-4 h-4 mr-1" />
            Preview & Apply ({selectedTargets.length})
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={keepMarkup} onCheckedChange={(v) => { setKeepMarkup(!!v); setTimeout(rebuild, 0); }} />
            Markup % အတိုင်း sale price ပြောင်း
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={onlyChanged} onCheckedChange={(v) => setOnlyChanged(!!v)} />
            ပြောင်းတဲ့ item တွေပဲပြ
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={hideUnmatched} onCheckedChange={(v) => setHideUnmatched(!!v)} />
            မ match တာတွေ ဖျောက်
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={strictMatch} onCheckedChange={(v) => setStrictMatch(!!v)} />
            Strict match (exact code only)
          </label>
        </div>
      </Card>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Matched" value={stats.matched} tone="success" />
          <Stat label="ဈေးတက်" value={stats.up} tone="warning" />
          <Stat label="ဈေးကျ" value={stats.down} tone="primary" />
          <Stat label="No match" value={stats.noMatch} tone="muted" />
          <Stat label="Partial match" value={stats.partial} tone="warning" />
          <Stat label="⚠ စစ်ရန်" value={stats.warnings} tone="warning" />
        </div>
      )}

      {visible.length > 0 && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.length > 0 && rows.every((r) => r.selected || !r.product || r.confidence !== 'exact' || !!r.warning)}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Code / Model</TableHead>
                <TableHead className="text-right">Old Cost</TableHead>
                <TableHead className="text-right">New Cost</TableHead>
                <TableHead className="text-right">Old Price</TableHead>
                <TableHead className="text-right">New Price</TableHead>
                <TableHead>Δ / Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.slice(0, 300).map((r) => {
                const idx = rows.indexOf(r);
                const diff = r.newCost - r.oldCost;
                return (
                  <TableRow key={idx} className={r.warning ? 'bg-destructive/5' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={r.selected}
                        disabled={!r.product}
                        onCheckedChange={(v) => updateRow(idx, { selected: !!v })}
                      />
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium">{r.product?.name || r.supplier.name || '—'}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {!r.product && <Badge variant="outline">No item</Badge>}
                        {r.confidence === 'exact' && r.matchBy && <Badge variant="secondary" className="text-[10px]">exact · {r.matchBy}</Badge>}
                        {r.confidence === 'partial' && <Badge variant="outline" className="text-[10px] border-destructive text-destructive">partial · {r.matchBy}</Badge>}
                      </div>
                      {r.warning && (
                        <div className="flex items-center gap-1 text-[11px] text-destructive mt-1">
                          <AlertTriangle className="w-3 h-3" />{r.warning}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div>{r.supplier.rawKey}</div>
                      {r.product?.barcode && r.product.barcode.replace(/[^A-Z0-9]/gi,'').toUpperCase() !== r.supplier.key && (
                        <div className="text-muted-foreground">↔ {r.product.barcode}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.product ? formatPrice(r.oldCost) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="h-8 w-24 text-right ml-auto"
                        value={r.newCost}
                        onChange={(e) => {
                          const c = Number(e.target.value) || 0;
                          const markup = r.oldCost > 0 ? r.oldPrice / r.oldCost : 1.3;
                          const jumpPct = r.oldCost > 0 ? Math.abs((c - r.oldCost) / r.oldCost) * 100 : 0;
                          updateRow(idx, {
                            newCost: c,
                            newPrice: keepMarkup ? Math.round(c * markup) : r.newPrice,
                            costJumpPct: jumpPct,
                            warning: r.product && r.oldCost > 0 && jumpPct >= SUSPICIOUS_JUMP_PCT
                              ? `ဈေးနှုန်း ${jumpPct.toFixed(0)}% ပြောင်းနေ — ပြန်စစ်ပါ`
                              : (r.confidence === 'partial' ? 'Partial match — code တိုက်စစ်ပါ' : undefined),
                          });
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

      {/* Preview / Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Apply မလုပ်ခင် Preview
            </DialogTitle>
            <DialogDescription>
              အောက်ပါ {selectedTargets.length} item ၏ cost / price ကို update လုပ်တော့မယ်။ မှန်ရင် Confirm နှိပ်ပါ။
            </DialogDescription>
          </DialogHeader>
          {selectedTargets.some((t) => t.warning) && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <div>
                သတိ — ဈေးနှုန်း ဆုံးဖြတ်ရခက်တဲ့ item {selectedTargets.filter((t) => t.warning).length} ခုပါနေတယ်။
                လိုအပ်ရင် dialog ပိတ်ပြီး ပြန်ဖြုတ်ပါ။
              </div>
            </div>
          )}
          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedTargets.map((t) => (
                  <TableRow key={t.product!.id} className={t.warning ? 'bg-destructive/5' : undefined}>
                    <TableCell className="max-w-[240px] truncate">{t.product!.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.supplier.rawKey}</TableCell>
                    <TableCell className="text-right text-xs">
                      <span className="text-muted-foreground line-through mr-1">{formatPrice(t.oldCost)}</span>
                      <span className="font-medium">{formatPrice(t.newCost)}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <span className="text-muted-foreground line-through mr-1">{formatPrice(t.oldPrice)}</span>
                      <span className="font-medium">{formatPrice(t.newPrice)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>ပယ်ဖျက်</Button>
            <Button onClick={apply}>Confirm & Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History / Rollback dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" /> Update History
            </DialogTitle>
            <DialogDescription>
              update လုပ်ပြီးသား batch တွေကို rollback (undo) လုပ်လို့ရပါတယ်။
            </DialogDescription>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">History မရှိသေးပါ</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {history.map((h) => (
                <Card key={h.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{h.note}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.appliedAt).toLocaleString()} · {h.changes.length} items
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => rollback(h)}>
                      <Undo2 className="w-4 h-4 mr-1" /> Rollback
                    </Button>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-muted-foreground">Items ကြည့်</summary>
                    <ul className="text-xs mt-2 space-y-1">
                      {h.changes.slice(0, 50).map((c) => (
                        <li key={c.productId} className="flex justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="text-muted-foreground">
                            {formatPrice(c.prevCost)} → {formatPrice(c.newCost)}
                          </span>
                        </li>
                      ))}
                      {h.changes.length > 50 && (
                        <li className="text-muted-foreground">+ {h.changes.length - 50} more</li>
                      )}
                    </ul>
                  </details>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
