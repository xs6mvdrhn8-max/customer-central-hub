import { useState, useMemo } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, DollarSign, Package, Printer } from 'lucide-react';
import { printHtml, escapeHtml } from '@/lib/print';

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ProfitLossAdmin() {
  const { invoices, purchases, ledger, formatPrice, settings } = useStore();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const setRange = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFrom(d.toISOString().slice(0, 10));
    setTo(today());
  };

  const data = useMemo(() => {
    const fromD = new Date(from);
    const toD = new Date(to);
    toD.setHours(23, 59, 59, 999);

    const inRange = invoices.filter((i) => {
      const d = new Date(i.date);
      return d >= fromD && d <= toD;
    });
    const purchasesInRange = purchases.filter((p) => {
      if (!p.orderDate) return false;
      const d = new Date(p.orderDate);
      return d >= fromD && d <= toD;
    });

    const totalSales = inRange.reduce((s, i) => s + i.total, 0);
    const totalCOGS = inRange.reduce((s, i) => s + i.totalCost, 0);
    const grossProfit = totalSales - totalCOGS;
    const margin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const totalPurchases = purchasesInRange.reduce(
      (s, p) => s + p.lines.reduce((ss, l) => ss + l.orderedQty * l.cost, 0), 0
    );
    const invoiceCount = inRange.length;

    // Per-item profit
    const itemMap = new Map<string, { name: string; qty: number; sales: number; cost: number; profit: number }>();
    inRange.forEach((inv) => {
      inv.lines.forEach((l) => {
        const cur = itemMap.get(l.productId) || { name: l.productName, qty: 0, sales: 0, cost: 0, profit: 0 };
        cur.qty += l.qty;
        cur.sales += l.qty * l.price;
        cur.cost += l.qty * l.cost;
        cur.profit = cur.sales - cur.cost;
        itemMap.set(l.productId, cur);
      });
    });
    const topItems = [...itemMap.values()].sort((a, b) => b.profit - a.profit).slice(0, 10);

    // Monthly breakdown
    const monthly = new Map<string, { sales: number; cost: number }>();
    inRange.forEach((inv) => {
      const m = inv.date.slice(0, 7);
      const cur = monthly.get(m) || { sales: 0, cost: 0 };
      cur.sales += inv.total;
      cur.cost += inv.totalCost;
      monthly.set(m, cur);
    });
    const monthlyArr = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const totalReceivable = ledger.filter((l) => l.type === 'receivable').reduce((s, l) => s + l.amount, 0);
    const totalPayable = ledger.filter((l) => l.type === 'payable').reduce((s, l) => s + l.amount, 0);

    return { totalSales, totalCOGS, grossProfit, margin, totalPurchases, invoiceCount, topItems, monthlyArr, totalReceivable, totalPayable };
  }, [from, to, invoices, purchases, ledger]);

  const stats = [
    { label: 'Total Sales', value: formatPrice(data.totalSales), icon: DollarSign, tone: 'text-primary bg-primary/10' },
    { label: 'COGS', value: formatPrice(data.totalCOGS), icon: Package, tone: 'text-warning-foreground bg-warning/10' },
    { label: 'Gross Profit', value: formatPrice(data.grossProfit), icon: data.grossProfit >= 0 ? TrendingUp : TrendingDown, tone: data.grossProfit >= 0 ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10' },
    { label: 'Margin', value: `${data.margin.toFixed(1)}%`, icon: TrendingUp, tone: 'text-accent-foreground bg-accent' },
  ];

  const maxMonthly = Math.max(...data.monthlyArr.map((m) => m[1].sales), 1);

  const printPL = () => {
    const topRows = data.topItems
      .map(
        (it) => `<tr>
          <td>${escapeHtml(it.name)}</td>
          <td class="right">${it.qty}</td>
          <td class="right">${formatPrice(it.sales)}</td>
          <td class="right">${formatPrice(it.cost)}</td>
          <td class="right">${formatPrice(it.profit)}</td>
        </tr>`,
      )
      .join('');
    const monthly = data.monthlyArr
      .map(
        ([m, v]) => `<tr>
          <td>${escapeHtml(m)}</td>
          <td class="right">${formatPrice(v.sales)}</td>
          <td class="right">${formatPrice(v.cost)}</td>
          <td class="right">${formatPrice(v.sales - v.cost)}</td>
        </tr>`,
      )
      .join('');
    const body = `
      <h2>Profit &amp; Loss</h2>
      <p class="muted">Period: ${escapeHtml(from)} → ${escapeHtml(to)} · ${data.invoiceCount} invoices</p>
      <table class="totals" style="margin-left:0;width:100%">
        <tr><td>Total Sales</td><td class="right">${formatPrice(data.totalSales)}</td></tr>
        <tr><td>Cost of Goods Sold</td><td class="right">${formatPrice(data.totalCOGS)}</td></tr>
        <tr><td class="grand">Gross Profit</td><td class="right grand">${formatPrice(data.grossProfit)} (${data.margin.toFixed(1)}%)</td></tr>
        <tr><td>Total Purchases</td><td class="right">${formatPrice(data.totalPurchases)}</td></tr>
        <tr><td>Receivables</td><td class="right">${formatPrice(data.totalReceivable)}</td></tr>
        <tr><td>Payables</td><td class="right">${formatPrice(data.totalPayable)}</td></tr>
      </table>
      ${monthly ? `<h3 style="margin-top:18px">Monthly Breakdown</h3>
        <table><thead><tr><th>Month</th><th class="right">Sales</th><th class="right">COGS</th><th class="right">Profit</th></tr></thead><tbody>${monthly}</tbody></table>` : ''}
      ${topRows ? `<h3 style="margin-top:18px">Top Items by Profit</h3>
        <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Profit</th></tr></thead><tbody>${topRows}</tbody></table>` : ''}
    `;
    printHtml(body, 'Profit & Loss', {
      storeName: settings.storeName,
      storeNote: settings.storeNote,
      logoUrl: settings.logoImageUrl,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h4 className="font-semibold">Date Range</h4>
          <Button size="sm" onClick={printPL}>
            <Printer className="w-4 h-4 mr-1" /> Print P&amp;L
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setRange(7)}>7d</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(30)}>30d</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(90)}>90d</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(365)}>1y</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{s.label}</p>
              <p className="text-lg font-bold mt-0.5">{s.value}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Invoices in period</p>
          <p className="text-xl font-bold mt-1">{data.invoiceCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Purchases</p>
          <p className="text-xl font-bold mt-1">{formatPrice(data.totalPurchases)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Net (Receivable - Payable)</p>
          <p className="text-xl font-bold mt-1">{formatPrice(data.totalReceivable - data.totalPayable)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <h4 className="font-semibold mb-3">Monthly Breakdown</h4>
        {data.monthlyArr.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data in selected range.</p>
        ) : (
          <div className="space-y-2">
            {data.monthlyArr.map(([m, v]) => (
              <div key={m}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{m}</span>
                  <span className="text-muted-foreground">
                    Sales: {formatPrice(v.sales)} · Profit: {formatPrice(v.sales - v.cost)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(v.sales / maxMonthly) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold mb-3">Top Items by Profit</h4>
        {data.topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales in range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2">Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Sales</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 font-medium">{it.name}</td>
                    <td className="text-right">{it.qty}</td>
                    <td className="text-right">{it.sales.toLocaleString()}</td>
                    <td className="text-right">{it.cost.toLocaleString()}</td>
                    <td className={`text-right font-semibold ${it.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {it.profit.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
