import { useState } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export function SettingsAdmin() {
  const { settings, updateSettings, adminCreds, updateAdminCreds, logoutAdmin } = useStore();
  const [s, setS] = useState(settings);
  const [creds, setCreds] = useState({ username: adminCreds.username, password: '' });

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(s);
    toast.success('Settings saved');
  };

  const saveCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!creds.username || !creds.password) return toast.error('Both required');
    updateAdminCreds(creds);
    toast.success('Admin login updated');
    setCreds({ username: creds.username, password: '' });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Store Settings</h4>
        <form onSubmit={saveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Store Name" value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} />
          <Input placeholder="Store Note" value={s.storeNote} onChange={(e) => setS({ ...s, storeNote: e.target.value })} />
          <Input placeholder="Hero Image URL" value={s.heroImageUrl || ''} onChange={(e) => setS({ ...s, heroImageUrl: e.target.value })} className="md:col-span-2" />
          <Input placeholder="Logo URL" value={s.logoImageUrl || ''} onChange={(e) => setS({ ...s, logoImageUrl: e.target.value })} className="md:col-span-2" />
          <div className="md:col-span-2">
            <Button type="submit">Save Store Settings</Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold mb-3">Admin Credentials</h4>
        <form onSubmit={saveCreds} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="New Username" value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} required />
          <Input type="password" placeholder="New Password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} required />
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">Update Admin Login</Button>
            <Button type="button" variant="outline" onClick={logoutAdmin}>Logout</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
