import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  Product, Customer, Vendor, PurchaseOrder, LedgerEntry,
  Invoice, CartItem, StoreSettings,
} from '@/types';

interface AdminCreds {
  username: string;
  password: string;
}

interface StoreState {
  products: Product[];
  customers: Customer[];
  vendors: Vendor[];
  purchases: PurchaseOrder[];
  ledger: LedgerEntry[];
  invoices: Invoice[];
  cart: CartItem[];
  settings: StoreSettings;
  adminCreds: AdminCreds;
  isAdmin: boolean;

  setProducts: (p: Product[]) => void;
  upsertProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;

  upsertCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  upsertVendor: (v: Vendor) => void;
  deleteVendor: (id: string) => void;

  upsertPurchase: (p: PurchaseOrder) => void;
  deletePurchase: (id: string) => void;

  upsertLedger: (l: LedgerEntry) => void;
  deleteLedger: (id: string) => void;

  addToCart: (p: Product, qty?: number) => void;
  updateCartQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;

  saveInvoice: (i: Omit<Invoice, 'id' | 'date'>) => Invoice;
  deleteInvoice: (id: string) => void;
  clearInvoices: () => void;

  updateSettings: (s: Partial<StoreSettings>) => void;
  updateAdminCreds: (c: AdminCreds) => void;
  loginAdmin: (u: string, p: string) => boolean;
  logoutAdmin: () => void;
}

const STORAGE_KEY = 'pt-store-v1';

const seedProducts: Product[] = [
  { id: 'p1', name: 'Cordless Drill 18V', category: 'Power Tools', price: 185000, cost: 140000, stock: 8, reorderLevel: 3, badge: 'DR', location: 'Shelf A-1', description: 'Heavy duty cordless drill with 2 batteries.' },
  { id: 'p2', name: 'Hammer 16oz', category: 'Hand Tools', price: 12000, cost: 7500, stock: 24, reorderLevel: 5, location: 'Shelf B-2', description: 'Steel claw hammer with rubber grip.' },
  { id: 'p3', name: 'PVC Pipe 1/2"', category: 'Plumbing', price: 4500, cost: 2800, stock: 60, reorderLevel: 20, location: 'Store Room', description: 'Standard PVC water pipe (per meter).' },
  { id: 'p4', name: 'LED Bulb 12W', category: 'Electrical', price: 3500, cost: 2000, stock: 120, reorderLevel: 30, location: 'Shelf C-3', description: 'Energy saving LED bulb, warm white.' },
  { id: 'p5', name: 'Paint Brush 3"', category: 'Paint', price: 2500, cost: 1300, stock: 4, reorderLevel: 10, badge: 'LO', location: 'Shelf D-1', description: 'Soft bristle paint brush.' },
  { id: 'p6', name: 'Steel Nails 3"', category: 'Hardware', price: 800, cost: 500, stock: 200, reorderLevel: 50, location: 'Drawer 4', description: 'Per kg, galvanized.' },
];

const defaultState = {
  products: seedProducts,
  customers: [] as Customer[],
  vendors: [
    { id: 'v1', name: 'Mandalay Tool Supply', phone: '09111222333', note: 'Power tools wholesaler' },
  ] as Vendor[],
  purchases: [] as PurchaseOrder[],
  ledger: [] as LedgerEntry[],
  invoices: [] as Invoice[],
  cart: [] as CartItem[],
  settings: {
    storeName: 'Phyo Tayote Hardware',
    storeNote: 'Offline ready hardware store',
    heroImageUrl: '',
    logoImageUrl: '',
  } as StoreSettings,
  adminCreds: { username: 'admin', password: 'admin' } as AdminCreds,
};

const StoreContext = createContext<StoreState | null>(null);

const uid = () => Math.random().toString(36).slice(2, 10);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch {
    return defaultState;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = loadState();
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [customers, setCustomers] = useState<Customer[]>(initial.customers);
  const [vendors, setVendors] = useState<Vendor[]>(initial.vendors);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>(initial.purchases);
  const [ledger, setLedger] = useState<LedgerEntry[]>(initial.ledger);
  const [invoices, setInvoices] = useState<Invoice[]>(initial.invoices);
  const [cart, setCart] = useState<CartItem[]>(initial.cart);
  const [settings, setSettings] = useState<StoreSettings>(initial.settings);
  const [adminCreds, setAdminCreds] = useState<AdminCreds>(initial.adminCreds);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const data = { products, customers, vendors, purchases, ledger, invoices, cart, settings, adminCreds };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [products, customers, vendors, purchases, ledger, invoices, cart, settings, adminCreds]);

  const upsert = <T extends { id: string }>(setter: (fn: (prev: T[]) => T[]) => void) => (item: T) => {
    setter((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx === -1) return [...prev, item];
      const copy = [...prev];
      copy[idx] = item;
      return copy;
    });
  };
  const remove = <T extends { id: string }>(setter: (fn: (prev: T[]) => T[]) => void) => (id: string) => {
    setter((prev) => prev.filter((x) => x.id !== id));
  };

  const value: StoreState = {
    products, customers, vendors, purchases, ledger, invoices, cart, settings, adminCreds, isAdmin,
    setProducts,
    upsertProduct: upsert(setProducts),
    deleteProduct: remove(setProducts),
    upsertCustomer: upsert(setCustomers),
    deleteCustomer: remove(setCustomers),
    upsertVendor: upsert(setVendors),
    deleteVendor: remove(setVendors),
    upsertPurchase: upsert(setPurchases),
    deletePurchase: remove(setPurchases),
    upsertLedger: upsert(setLedger),
    deleteLedger: remove(setLedger),

    addToCart: (p, qty = 1) => {
      setCart((prev) => {
        const idx = prev.findIndex((c) => c.product.id === p.id);
        if (idx === -1) return [...prev, { product: p, qty }];
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      });
    },
    updateCartQty: (id, qty) => {
      setCart((prev) => prev.map((c) => (c.product.id === id ? { ...c, qty } : c)).filter((c) => c.qty > 0));
    },
    removeFromCart: (id) => setCart((prev) => prev.filter((c) => c.product.id !== id)),
    clearCart: () => setCart([]),

    saveInvoice: (data) => {
      const inv: Invoice = { ...data, id: uid(), date: new Date().toISOString() };
      setInvoices((prev) => [inv, ...prev]);
      // decrement stock
      setProducts((prev) => prev.map((p) => {
        const line = inv.lines.find((l) => l.productId === p.id);
        return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
      }));
      return inv;
    },
    deleteInvoice: (id) => setInvoices((prev) => prev.filter((i) => i.id !== id)),
    clearInvoices: () => setInvoices([]),

    updateSettings: (s) => setSettings((prev) => ({ ...prev, ...s })),
    updateAdminCreds: (c) => setAdminCreds(c),
    loginAdmin: (u, p) => {
      if (u === adminCreds.username && p === adminCreds.password) {
        setIsAdmin(true);
        return true;
      }
      return false;
    },
    logoutAdmin: () => setIsAdmin(false),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export { uid };
