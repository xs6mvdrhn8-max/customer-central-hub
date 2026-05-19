import { useState } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileText, AlertTriangle, CheckCircle2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  parseQuickBooksFile, summarize, QBImportResult,
} from '@/lib/importQuickbooks';

type Section = 'customers' | 'vendors' | 'products' | 'invoices' | 'purchases' | 'ledger';
type Selected = Record<Section, boolean>;

const HISTORY_KEY = 'qb-import-history-v1';

interface Snapshot {
  ts: number;
  fileName: string;
  added: Record<Section, string[]>; // ids added per section
}

function loadHistory(): Snapshot[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(h: Snapshot[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20))); } catch { /* ignore */ }
}

export function QuickBooksImportAdmin() {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QBImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [selected, setSelected] = useState<Selected>({
    customers: true, vendors: true, products: true,
    invoices: true, purchases: true, ledger: true,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>(loadHistory());

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const r = await parseQuickBooksFile(f);
      setResult(r);
      setFileName(f.name);
      toast.success(`Parsed (${r.format}): ${summarize(r)}`);
      if (r.warnings.length) r.warnings.forEach((w) => toast.warning(w));
    } catch (err: any) {
      setResult(null);
      toast.error(err?.message || 'Failed to parse file');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result) return;
    const snap: Snapshot = {
      ts: Date.now(), fileName,
      added: { customers: [], vendors: [], products: [], invoices: [], purchases: [], ledger: [] },
    };

    if (selected.customers) result.customers.forEach((c) => { store.upsertCustomer(c); snap.added.customers.push(c.id); });
    if (selected.vendors) result.vendors.forEach((v) => { store.upsertVendor(v); snap.added.vendors.push(v.id); });
    if (selected.products) result.products.forEach((p) => { store.upsertProduct(p); snap.added.products.push(p.id); });
    if (selected.purchases) result.purchases.forEach((p) => { store.upsertPurchase(p); snap.added.purchases.push(p.id); });
    if (selected.ledger) result.ledger.forEach((l) => { store.upsertLedger(l); snap.added.ledger.push(l.id); });
    if (selected.invoices && result.invoices.length) {
      // Bypass saveInvoice (which decrements stock) — append directly via reorderInvoices.
      const next = [...result.invoices, ...store.invoices];
      store.reorderInvoices(next);
      result.invoices.forEach((i) => snap.added.invoices.push(i.id));
    }

    const newHist = [snap, ...history];
    saveHistory(newHist);
    setHistory(newHist);
    setConfirmOpen(false);
    setResult(null);
    toast.success('Import applied. You can undo from history below.');
  };

  const rollback = (snap: Snapshot) => {
    snap.added.customers.forEach((id) => store.deleteCustomer(id));
    snap.added.vendors.forEach((id) => store.deleteVendor(id));
    snap.added.products.forEach((id) => store.deleteProduct(id));
    snap.added.purchases.forEach((id) => store.deletePurchase(id));
    snap.added.ledger.forEach((id) => store.deleteLedger(id));
    if (snap.added.invoices.length) {
      const remove = new Set(snap.added.invoices);
      store.reorderInvoices(store.invoices.filter((i) => !remove.has(i.id)));
    }
    const newHist = history.filter((h) => h.ts !== snap.ts);
    saveHistory(newHist);
    setHistory(newHist);
    toast.success(`Rolled back: ${snap.fileName}`);
  };

  const sectionCounts: Record<Section, number> = result ? {
    customers: result.customers.length,
    vendors: result.vendors.length,
    products: result.products.length,
    invoices: result.invoices.length,
    purchases: result.purchases.length,
    ledger: result.ledger.length,
  } : { customers: 0, vendors: 0, products: 0, invoices: 0, purchases: 0, ledger: 0 };

  const totalSelected = (Object.keys(selected) as Section[])
    .filter((k) => selected[k]).reduce((s, k) => s + sectionCounts[k], 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <FileText className="w-5 h-5 mt-0.5 text-primary" />
          <div className="flex-1">
            <h3 className="font-semibold">QuickBooks Import</h3>
            <p className="text-sm text-muted-foreground">
              .IIF, .QBO/.QFX, CSV exports ထည့်ပါ။ .QBB/.QBW (binary backup) ဖိုင်တွေက QuickBooks Desktop ထဲကနေ
              File → Utilities → Export → IIF Files လို့ ပြောင်းပြီး တင်ပေးပါ။
            </p>
          </div>
        </div>
        <label className="block">
          <input
            type="file"
            accept=".iif,.qbo,.qfx,.ofx,.csv,.qbb,.qbw,.qbm,text/*"
            className="hidden"
            onChange={handleFile}
            disabled={busy}
          />
          <span className="inline-flex">
            <Button asChild disabled={busy}>
              <span className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                {busy ? 'Parsing…' : 'Choose QuickBooks file'}
              </span>
            </Button>
          </span>
        </label>
      </Card>

      {result && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-medium">{fileName}</div>
                <div className="text-xs text-muted-foreground">
                  Format: <Badge variant="secondary">{result.format}</Badge> · {summarize(result)}
                </div>
              </div>
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={totalSelected === 0}>
              Preview & Apply ({totalSelected})
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(sectionCounts) as Section[]).map((k) => (
              <label
                key={k}
                className={`flex items-center gap-2 p-2 rounded border ${
                  sectionCounts[k] === 0 ? 'opacity-50' : 'cursor-pointer hover:bg-muted'
                }`}
              >
                <Checkbox
                  checked={selected[k] && sectionCounts[k] > 0}
                  disabled={sectionCounts[k] === 0}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [k]: !!v }))}
                />
                <span className="capitalize text-sm">{k}</span>
                <Badge variant="outline" className="ml-auto">{sectionCounts[k]}</Badge>
              </label>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="text-xs text-amber-600 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{result.warnings.join(' · ')}</div>
            </div>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Undo2 className="w-4 h-4" /> Import history (rollback)
          </h4>
          <div className="space-y-2">
            {history.map((h) => {
              const total = (Object.values(h.added) as string[][]).reduce((s, a) => s + a.length, 0);
              return (
                <div key={h.ts} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                  <div>
                    <div className="font-medium">{h.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.ts).toLocaleString()} · {total} records
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => rollback(h)}>
                    <Undo2 className="w-3 h-3 mr-1" /> Undo
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview import</DialogTitle>
            <DialogDescription>
              အောက်ပါ records တွေကို store ထဲထည့်ပါမယ်။ Apply ပြီးရင် history ထဲက Undo နဲ့ပြန်ဖျက်နိုင်ပါတယ်။
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] pr-3">
            {result && (Object.keys(selected) as Section[])
              .filter((k) => selected[k] && sectionCounts[k] > 0)
              .map((k) => (
                <div key={k} className="mb-3">
                  <div className="font-medium capitalize mb-1">{k} ({sectionCounts[k]})</div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {previewLines(result, k).slice(0, 5).map((line, i) => (
                      <div key={i}>• {line}</div>
                    ))}
                    {sectionCounts[k] > 5 && <div>… and {sectionCounts[k] - 5} more</div>}
                  </div>
                </div>
              ))}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={apply}>Apply import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function previewLines(r: QBImportResult, section: Section): string[] {
  switch (section) {
    case 'customers': return r.customers.map((c) => `${c.name}${c.phone ? ` · ${c.phone}` : ''}`);
    case 'vendors': return r.vendors.map((v) => `${v.name}${v.phone ? ` · ${v.phone}` : ''}`);
    case 'products': return r.products.map((p) => `${p.name} · price ${p.price} · stock ${p.stock}`);
    case 'invoices': return r.invoices.map((i) => `${i.date.slice(0, 10)} · ${i.customerName} · ${i.total}`);
    case 'purchases': return r.purchases.map((p) => `${p.orderDate.slice(0, 10)} · ${p.vendorName} · ${p.lines.length} lines`);
    case 'ledger': return r.ledger.map((l) => `${l.type} · ${l.name} · ${l.amount}`);
  }
}
