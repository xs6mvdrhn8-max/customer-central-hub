import { importSchema, ImportPayload } from './importSchema';

const objectKeys = ['data', 'state', 'payload', 'backup', 'store', 'storeData', 'offlineState', 'value'];
const storageKeys = ['pt-store-v2', 'state-v1'];

type ParseResult =
  | { ok: true; data: ImportPayload; exportedAt?: string; counts: BackupCounts }
  | { ok: false; error: string };

export type BackupCounts = {
  products: number;
  customers: number;
  invoices: number;
  vendors: number;
  purchases: number;
  ledger: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseJsonLike = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
};

const unwrapBackup = (raw: unknown): unknown => {
  let current = parseJsonLike(raw);
  for (let i = 0; i < 6; i += 1) {
    if (Array.isArray(current)) return { products: current };
    if (!isRecord(current)) return current;

    let changed = false;
    for (const key of [...objectKeys, ...storageKeys]) {
      const nested = parseJsonLike(current[key]);
      if (!isRecord(nested) && !Array.isArray(nested)) continue;
      current = Array.isArray(nested)
        ? { ...current, products: nested }
        : { ...current, ...nested };
      changed = true;
      break;
    }
    if (!changed) return current;
  }
  return current;
};

const pick = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  return undefined;
};

const arr = (obj: Record<string, unknown>, keys: string[]) => {
  const value = parseJsonLike(pick(obj, keys));
  const raw = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : undefined;
  if (!raw) return undefined;
  return raw.map(parseJsonLike).filter(isRecord).map((item) => ({ ...item }));
};

const text = (value: unknown, fallback = '') => value === undefined || value === null ? fallback : String(value);
const num = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const id = (prefix: string, item: Record<string, unknown>, index: number) =>
  text(pick(item, ['id', '_id', 'uuid', 'code', 'sku', 'barcode']), `${prefix}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`);

const normalizeProducts = (items?: Record<string, unknown>[]) => items?.map((item, index) => ({
  ...item,
  id: id('product', item, index),
  name: text(pick(item, ['name', 'itemName', 'productName', 'title']), `Item ${index + 1}`),
  category: text(pick(item, ['category', 'type', 'class']), 'Uncategorized'),
  price: num(pick(item, ['price', 'salePrice', 'salesPrice', 'retail']), 0),
  cost: num(pick(item, ['cost', 'purchaseCost', 'avgCost']), 0),
  stock: num(pick(item, ['stock', 'stockQty', 'quantity', 'qty', 'onHand']), 0),
  reorderLevel: num(pick(item, ['reorderLevel', 'reorder', 'min']), 0),
  imageUrl: text(pick(item, ['imageUrl', 'image', 'photo', 'picture']), ''),
}));

const normalizeNamed = (prefix: string, items?: Record<string, unknown>[]) => items?.map((item, index) => ({
  ...item,
  id: id(prefix, item, index),
  name: text(pick(item, ['name', 'customerName', 'vendorName', 'supplierName']), `${prefix} ${index + 1}`),
}));

const normalizeWithId = (prefix: string, items?: Record<string, unknown>[]) => items?.map((item, index) => ({
  ...item,
  id: id(prefix, item, index),
}));

export function parseBackupJson(json: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { ok: false, error: 'File is not valid JSON.' }; }

  const unwrapped = unwrapBackup(raw);
  if (!isRecord(unwrapped)) return { ok: false, error: 'Backup file structure is not supported.' };

  const normalized = {
    products: normalizeProducts(arr(unwrapped, ['products', 'items', 'inventory', 'catalog'])),
    customers: normalizeNamed('customer', arr(unwrapped, ['customers', 'clients', 'receivablesCustomers'])),
    vendors: normalizeNamed('vendor', arr(unwrapped, ['vendors', 'suppliers'])),
    purchases: normalizeWithId('purchase', arr(unwrapped, ['purchases', 'purchaseOrders', 'purchase_orders'])),
    ledger: normalizeWithId('ledger', arr(unwrapped, ['ledger', 'ledgers', 'entries'])),
    invoices: normalizeWithId('invoice', arr(unwrapped, ['invoices', 'sales', 'orders', 'saleRecords'])),
    settings: isRecord(pick(unwrapped, ['settings', 'storeSettings'])) ? pick(unwrapped, ['settings', 'storeSettings']) : undefined,
    theme: isRecord(unwrapped.theme) ? unwrapped.theme : undefined,
    prefs: isRecord(pick(unwrapped, ['prefs', 'preferences'])) ? pick(unwrapped, ['prefs', 'preferences']) : undefined,
    categories: Array.isArray(unwrapped.categories) ? unwrapped.categories.map(String) : undefined,
  };

  const result = importSchema.safeParse(normalized);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.join('.') || 'file';
    return { ok: false, error: `Backup rejected at "${where}": ${first?.message || 'invalid'}` };
  }

  const data = result.data;
  const counts: BackupCounts = {
    products: data.products?.length ?? 0,
    customers: data.customers?.length ?? 0,
    invoices: data.invoices?.length ?? 0,
    vendors: data.vendors?.length ?? 0,
    purchases: data.purchases?.length ?? 0,
    ledger: data.ledger?.length ?? 0,
  };

  if (!Object.values(counts).some(Boolean) && !data.settings && !data.theme && !data.prefs && !data.categories) {
    return { ok: false, error: 'No backup data found in this file.' };
  }

  return { ok: true, data, counts, exportedAt: text(pick(unwrapped, ['exportedAt', 'createdAt', 'backupDate']), '') || undefined };
}