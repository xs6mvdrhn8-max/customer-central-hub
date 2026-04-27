import { useState } from 'react';
import { useStore, uid } from '@/store/StoreContext';
import { Customer } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, Download, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { SortableList } from '@/components/SortableList';
import { downloadCsv, parseCsv, pickFile, toCsv } from '@/lib/csv';

const empty: Customer = { id: '', name: '', phone: '', email: '', address: '', note: '' };
const HEADERS = ['name', 'phone', 'email', 'address', 'note'];

export function CustomersAdmin() {
  const { customers, upsertCustomer, deleteCustomer, reorderCustomers } = useStore();
  const [form, setForm] = useState<Customer>(empty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error('Name required');
    upsertCustomer({ ...form, id: form.id || uid() });
    toast.success(form.id ? 'Customer updated' : 'Customer added');
    setForm(empty);
  };

  const exportCsv = () => {
    const rows = customers.map((c) => ({
      name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', note: c.note || '',
    }));
    downloadCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, HEADERS));
    toast.success(`Exported ${rows.length} customers`);
  };

  const downloadTemplate = () => downloadCsv('customers-template.csv', toCsv([], HEADERS));

  const importCsv = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) return toast.error('CSV is empty');
      const next = [...customers];
      let added = 0;
      let updated = 0;
      const errors: string[] = [];
      rows.forEach((r, idx) => {
        if (!r.name) { errors.push(`Row ${idx + 2}: name is required`); return; }
        const existing = next.find((c) => c.name.toLowerCase() === r.name.toLowerCase());
        const merged: Customer = {
          id: existing?.id || uid(),
          name: r.name,
          phone: r.phone || '',
          email: r.email || '',
          address: r.address || '',
          note: r.note || '',
        };
        if (existing) {
          const i = next.findIndex((c) => c.id === existing.id);
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
      reorderCustomers(next);
      toast.success(`Imported — ${added} added, ${updated} updated`);
    } catch (err: any) {
      toast.error(err?.message || 'CSV import failed');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-semibold mb-3">{form.id ? 'Edit Customer' : 'Add Customer'}</h4>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Customer Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input placeholder="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea placeholder="Note" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} className="md:col-span-2" rows={2} />
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">Save Customer</Button>
            <Button type="button" variant="outline" onClick={() => setForm(empty)}>Reset</Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h4 className="font-semibold">Customers ({customers.length})</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1" />Export</Button>
            <Button size="sm" variant="outline" onClick={importCsv}><Upload className="w-3.5 h-3.5 mr-1" />Import</Button>
            <Button size="sm" variant="ghost" onClick={downloadTemplate}><FileText className="w-3.5 h-3.5 mr-1" />Template</Button>
          </div>
        </div>
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          <SortableList
            className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1"
            items={customers}
            getId={(c) => c.id}
            onReorder={reorderCustomers}
            renderItem={(c) => (
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.phone, c.email, c.address, c.note].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setForm(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Delete?')) deleteCustomer(c.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
}
