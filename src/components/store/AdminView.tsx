import { useState } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { ItemsAdmin } from '@/components/admin/ItemsAdmin';
import { CustomersAdmin } from '@/components/admin/CustomersAdmin';
import { VendorsAdmin } from '@/components/admin/VendorsAdmin';
import { PurchasesAdmin } from '@/components/admin/PurchasesAdmin';
import { LedgerAdmin } from '@/components/admin/LedgerAdmin';
import { ProfitLossAdmin } from '@/components/admin/ProfitLossAdmin';
import { SettingsAdmin } from '@/components/admin/SettingsAdmin';
import { CustomizationAdmin } from '@/components/admin/CustomizationAdmin';

export function AdminView() {
  const { isAdmin, loginAdmin, logoutAdmin } = useStore();
  const [u, setU] = useState('');
  const [p, setP] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginAdmin(u, p)) {
      toast.success('Admin unlocked');
      setU(''); setP('');
    } else {
      toast.error('Invalid credentials');
    }
  };

  if (!isAdmin) {
    return (
      <Card className="p-8 max-w-md mx-auto mt-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Admin Access</p>
            <h3 className="text-lg font-semibold">Login Required</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Default: <code className="bg-muted px-1.5 py-0.5 rounded">admin / admin</code>
        </p>
        <form onSubmit={handleLogin} className="space-y-3">
          <Input placeholder="User Name" value={u} onChange={(e) => setU(e.target.value)} required />
          <Input type="password" placeholder="Password" value={p} onChange={(e) => setP(e.target.value)} required />
          <Button type="submit" className="w-full">Admin Login</Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-4 flex items-center justify-between bg-gradient-to-r from-primary to-[hsl(var(--primary)/0.7)] text-primary-foreground">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6" />
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">Admin Panel</p>
            <h3 className="font-semibold">All management & customization tools</h3>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={logoutAdmin}>Logout</Button>
      </Card>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap gap-1">
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="pl">P & L</TabsTrigger>
          <TabsTrigger value="customize">Customize</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-4"><ItemsAdmin /></TabsContent>
        <TabsContent value="customers" className="mt-4"><CustomersAdmin /></TabsContent>
        <TabsContent value="vendors" className="mt-4"><VendorsAdmin /></TabsContent>
        <TabsContent value="purchases" className="mt-4"><PurchasesAdmin /></TabsContent>
        <TabsContent value="ledger" className="mt-4"><LedgerAdmin /></TabsContent>
        <TabsContent value="pl" className="mt-4"><ProfitLossAdmin /></TabsContent>
        <TabsContent value="customize" className="mt-4"><CustomizationAdmin /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}
