import { useMemo, useState } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Printer, Trash2, FileText } from 'lucide-react';
import { SortableList } from '@/components/SortableList';
import { Invoice } from '@/types';
import { printHtml, escapeHtml } from '@/lib/print';

export function InvoicesView() {
  const { invoices, deleteInvoice, clearInvoices, reorderInvoices, formatPrice, settings } = useStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const printInvoice = (inv: Invoice) => {
    const lines = inv.lines
      .map(
        (l, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(l.productName)}</td>
          <td class="right">${l.qty}</td>
          <td class="right">${formatPrice(l.price)}</td>
          <td class="right">${formatPrice(l.qty * l.price)}</td>
        </tr>`,
      )
      .join('');
    const balance = inv.total - inv.paidAmount;
    const body = `
      <h2>Invoice</h2>
      <p class="muted">Invoice #${escapeHtml(inv.id)} · ${new Date(inv.date).toLocaleString()}</p>
      <p><strong>${escapeHtml(inv.customerName)}</strong>${inv.phoneNumber ? ` · ${escapeHtml(inv.phoneNumber)}` : ''}</p>
      <p class="muted">Sale type: ${inv.saleType.toUpperCase()}</p>
      <table>
        <thead><tr><th>#</th><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Amount</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td>${formatPrice(inv.total)}</td></tr>
        <tr><td>Paid</td><td>${formatPrice(inv.paidAmount)}</td></tr>
        <tr><td class="grand">Balance</td><td class="grand">${formatPrice(balance)}</td></tr>
      </table>
      ${inv.note ? `<p class="muted" style="margin-top:12px"><em>${escapeHtml(inv.note)}</em></p>` : ''}
      <div class="stamp"><div>Customer Signature</div><div>Authorised Signature</div></div>
    `;
    printHtml(body, `Invoice ${inv.id}`, {
      storeName: settings.storeName,
      storeNote: settings.storeNote,
      logoUrl: settings.logoImageUrl,
    });
  };

  const filteredForReport = useMemo(() => {
    if (!from && !to) return invoices;
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;
    if (toD) toD.setHours(23, 59, 59, 999);
    return invoices.filter((i) => {
      const d = new Date(i.date);
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
      return true;
    });
  }, [invoices, from, to]);

  const printSalesReport = () => {
    const list = filteredForReport;
    if (list.length === 0) return;
    const total = list.reduce((s, i) => s + i.total, 0);
    const paid = list.reduce((s, i) => s + i.paidAmount, 0);
    const items = list.reduce((s, i) => s + i.lines.reduce((ss, l) => ss + l.qty, 0), 0);
    const rows = list
      .map(
        (i) => `<tr>
          <td>${new Date(i.date).toLocaleDateString()}</td>
          <td>${escapeHtml(i.customerName)}</td>
          <td>${i.saleType}</td>
          <td class="right">${i.lines.reduce((s, l) => s + l.qty, 0)}</td>
          <td class="right">${formatPrice(i.total)}</td>
          <td class="right">${formatPrice(i.paidAmount)}</td>
        </tr>`,
      )
      .join('');
    const range = from || to ? `${from || '...'} → ${to || '...'}` : 'All Time';
    const body = `
      <h2>Sales Report</h2>
      <p class="muted">Range: ${escapeHtml(range)} · ${list.length} invoices · ${items} items sold</p>
      <table>
        <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th class="right">Qty</th><th class="right">Total</th><th class="right">Paid</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table class="totals">
        <tr><td>Total Paid</td><td>${formatPrice(paid)}</td></tr>
        <tr><td class="grand">Grand Total</td><td class="grand">${formatPrice(total)}</td></tr>
      </table>
    `;
    printHtml(body, 'Sales Report', {
      storeName: settings.storeName,
      storeNote: settings.storeNote,
      logoUrl: settings.logoImageUrl,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Reports</p>
            <h3 className="text-lg font-semibold">Sales Report</h3>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs block">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs block">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
            <Button size="sm" onClick={printSalesReport} disabled={filteredForReport.length === 0}>
              <FileText className="w-4 h-4 mr-1" /> Print Sales ({filteredForReport.length})
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoices</p>
            <h3 className="text-lg font-semibold">Saved Sales Invoices</h3>
          </div>
          {invoices.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearInvoices}>Clear All</Button>
          )}
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <SortableList
            className="space-y-3"
            items={invoices}
            getId={(inv) => inv.id}
            onReorder={reorderInvoices}
            renderItem={(inv) => (
              <Card className="p-4 bg-muted/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{inv.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inv.date).toLocaleString()} · {inv.saleType.toUpperCase()}
                      {inv.phoneNumber && ` · ${inv.phoneNumber}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{formatPrice(inv.total)}</p>
                    <p className="text-xs text-muted-foreground">Paid: {formatPrice(inv.paidAmount)}</p>
                  </div>
                </div>
                <div className="mt-3 text-sm">
                  {inv.lines.map((l, i) => (
                    <div key={i} className="flex justify-between py-1 border-t first:border-t-0">
                      <span>{l.productName} × {l.qty}</span>
                      <span>{formatPrice(l.price * l.qty)}</span>
                    </div>
                  ))}
                </div>
                {inv.note && <p className="text-xs italic mt-2 text-muted-foreground">{inv.note}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => printInvoice(inv)}>
                    <Printer className="w-3.5 h-3.5 mr-1" /> Print
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteInvoice(inv.id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </Card>
            )}
          />
        )}
      </Card>
    </div>
  );
}
