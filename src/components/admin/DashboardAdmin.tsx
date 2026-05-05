import { useMemo } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Package, Receipt, TrendingUp, ShoppingCart } from 'lucide-react';

export function DashboardAdmin() {
  const { products, invoices, formatPrice } = useStore();

  const { todayTotal, weekTotal, monthTotal, allTotal, todayCount, topItems } = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - 6 * 86400000;
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let today = 0, week = 0, month = 0, all = 0, tCount = 0;
    const itemMap = new Map<string, { name: string; qty: number; total: number }>();
    invoices.forEach((inv) => {
      const t = new Date(inv.date).getTime();
      all += inv.total;
      if (t >= startMonth) month += inv.total;
      if (t >= startWeek) week += inv.total;
      if (t >= startToday) { today += inv.total; tCount += 1; }
      inv.lines.forEach((l) => {
        const cur = itemMap.get(l.productId) || { name: l.productName, qty: 0, total: 0 };
        cur.qty += l.qty;
        cur.total += l.qty * l.price;
        itemMap.set(l.productId, cur);
      });
    });
    const top = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return { todayTotal: today, weekTotal: week, monthTotal: month, allTotal: all, todayCount: tCount, topItems: top };
  }, [invoices]);

  const lowStock = products.filter((p) => p.stock <= p.reorderLevel);

  const stats = [
    { label: "ယနေ့ ရောင်းအား", value: formatPrice(todayTotal), sub: `${todayCount} invoices`, icon: Receipt, tone: 'bg-primary/10 text-primary' },
    { label: '၇ ရက်အတွင်း', value: formatPrice(weekTotal), sub: 'Last 7 days', icon: TrendingUp, tone: 'bg-success/10 text-success' },
    { label: 'လအတွင်း', value: formatPrice(monthTotal), sub: 'This month', icon: ShoppingCart, tone: 'bg-accent text-accent-foreground' },
    { label: 'စုစုပေါင်း', value: formatPrice(allTotal), sub: `${invoices.length} invoices`, icon: Package, tone: 'bg-warning/10 text-warning-foreground' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 min-w-0 overflow-hidden">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.tone}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-xs text-muted-foreground mt-3 truncate">{s.label}</p>
              <p className="text-base md:text-xl font-bold mt-1 truncate">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.sub}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h4 className="font-semibold">Low Stock Alerts ({lowStock.length})</h4>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">အားလုံးလက်ကျန်ပြည့်နေပါသည်။ ✓</p>
          ) : (
            <ul className="divide-y max-h-80 overflow-y-auto scrollbar-thin">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.category}{p.location ? ` · ${p.location}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-destructive whitespace-nowrap ml-2">
                    {p.stock} / {p.reorderLevel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-success" />
            <h4 className="font-semibold">Top ရောင်းအား ပစ္စည်းများ</h4>
          </div>
          {topItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">ရောင်းအားမရှိသေးပါ။</p>
          ) : (
            <ul className="divide-y">
              {topItems.map((it, i) => (
                <li key={i} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                    <p className="font-medium text-sm truncate">{it.name}</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="text-sm font-semibold">{it.qty} pcs</p>
                    <p className="text-[11px] text-muted-foreground">{formatPrice(it.total)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
