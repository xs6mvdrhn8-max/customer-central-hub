import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Package, Receipt, Users } from 'lucide-react';

export function OverviewView() {
  const { products, invoices, customers, ledger, settings } = useStore();

  const totalSales = invoices.reduce((s, i) => s + i.total, 0);
  const totalItems = products.length;
  const lowStock = products.filter((p) => p.stock <= p.reorderLevel);
  const totalReceivable = ledger.filter((l) => l.type === 'receivable').reduce((s, l) => s + l.amount, 0);

  const stats = [
    { label: 'Total Sales', value: `${totalSales.toLocaleString()} Ks`, icon: Receipt, tone: 'bg-primary/10 text-primary' },
    { label: 'Items', value: totalItems, icon: Package, tone: 'bg-accent/10 text-accent' },
    { label: 'Customers', value: customers.length, icon: Users, tone: 'bg-success/10 text-success' },
    { label: 'Receivable', value: `${totalReceivable.toLocaleString()} Ks`, icon: AlertTriangle, tone: 'bg-warning/10 text-warning-foreground' },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-primary to-accent text-primary-foreground">
        <p className="text-xs uppercase tracking-wider opacity-80">Store</p>
        <h2 className="text-3xl font-bold mt-1">{settings.storeName}</h2>
        <p className="opacity-90 mt-2">{settings.storeNote}</p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.tone}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-xs text-muted-foreground mt-3">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
            </Card>
          );
        })}
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">သတိပေးချက်များ / Alerts</h3>
        {lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">No low-stock alerts.</p>
        ) : (
          <ul className="divide-y">
            {lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.category} · {p.location}</p>
                </div>
                <span className="text-sm font-semibold text-destructive">
                  Stock: {p.stock} (≤ {p.reorderLevel})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
