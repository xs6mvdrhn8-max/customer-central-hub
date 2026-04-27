import { useState } from 'react';
import { useStore, uid } from '@/store/StoreContext';
import { Vendor } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, Download, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { SortableList } from '@/components/SortableList';
import { downloadCsv, parseCsv, pickFile, toCsv } from '@/lib/csv';

const empty: Vendor = { id: '', name: '', phone: '', email: '', address: '', note: '' };
const HEADERS = ['name', 'phone', 'email', 'address', 'note'];

export function VendorsAdmin() {
  const { vendors, upsertVendor, deleteVendor, reorderVendors } = useStore();
  const [form, setForm] = useState<Vendor>(empty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error('Name required');
    upsertVendor({ ...form, id: form.id || uid() });
    toast.success(form.id ? 'Vendor updated' : 'Vendor added');
    setForm(empty);
  };

  const exportCsv = () => {
    const rows = vendors.map((v) => ({
      name: v.name, phone: v.phone || '', email: v.email || '', address: v.address || '', note: v.note || '',
    }));
    downloadCsv(`vendors-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, HEADERS));
    toast.success(`Exported ${rows.length} vendors`);
  };

  const downloadTemplate = () => downloadCsv('vendors-template.csv', toCsv([], HEADERS));

  const importCsv = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) return toast.error('CSV is empty');
      const next = [...vendors];
      let added = 0;
      let updated = 0;
      const errors: string[] = [];
      rows.forEach((r, idx) => {
        if (!r.name) { errors.push(`Row ${idx + 2}: name is required`); return; }
        const existing = next.find((v) => v.name.toLowerCase() === r.name.toLowerCase());
        const merged: Vendor = {
          id: existing?.id || uid(),
          name: r.name,
          phone: r.phone || '',
          email: r.email || '',
          address: r.address || '',
          note: r.note || '',
        };
        if (existing) {
          const i = next.findIndex((v) => v.id === existing.id);
          next[i] = merged;
          updated++;
        } else {
          next.push(merged);
          added++;
        }
      });
      if (errors.length) {
        toast.error(`${errors.length} error(s). First: ${errors[0]}`);
        return;
      }
      reorderVendors(next);
      toast.success(`Imported — ${added} added, ${updated} updated`);
    } catch (err: any) {
      toast.error(err?.message || 'CSV import failed');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-semibold mb-3">{form.id ? 'Edit Vendor' : 'Add Vendor'}</h4>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Supplier Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input placeholder="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea placeholder="Note" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} className="md:col-span-2" rows={2} />
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">Save Vendor</Button>
            <Button type="button" variant="outline" onClick={() => setForm(empty)}>Reset</Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h4 className="font-semibold">Vendors ({vendors.length})</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1" />Export</Button>
            <Button size="sm" variant="outline" onClick={importCsv}><Upload className="w-3.5 h-3.5 mr-1" />Import</Button>
            <Button size="sm" variant="ghost" onClick={downloadTemplate}><FileText className="w-3.5 h-3.5 mr-1" />Template</Button>
          </div>
        </div>
        <SortableList
          className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1"
          items={vendors}
          getId={(v) => v.id}
          onReorder={reorderVendors}
          renderItem={(v) => (
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
              <div className="min-w-0">
                <p className="font-medium text-sm">{v.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[v.phone, v.email, v.address, v.note].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setForm(v)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Delete?')) deleteVendor(v.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
