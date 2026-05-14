import { z } from 'zod';

// Backup imports — no size limits. Backups can include base64 images and
// unlimited records (products, invoices, purchases, ledger, etc.).
// `adminCreds` is intentionally OMITTED — backup files must never be able
// to overwrite admin login credentials.

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number().finite().min(0),
  originalPrice: z.number().finite().min(0).optional(),
  cost: z.number().finite().min(0),
  stock: z.number().finite().min(0),
  reorderLevel: z.number().finite().min(0),
  badge: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  vendorId: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
}).passthrough();

const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
}).passthrough();

const vendorSchema = customerSchema;

const purchaseSchema = z.object({ id: z.string() }).passthrough();
const ledgerSchema = z.object({ id: z.string() }).passthrough();
const invoiceSchema = z.object({ id: z.string() }).passthrough();

const settingsSchema = z.object({
  storeName: z.string(),
  storeNote: z.string().optional().default(''),
  heroImageUrl: z.string().optional().default(''),
  logoImageUrl: z.string().optional().default(''),
}).partial().passthrough();

const themeSchema = z.object({
  primaryHue: z.number().min(0).max(360),
  primarySat: z.number().min(0).max(100),
  primaryLight: z.number().min(0).max(100),
  radius: z.number().min(0).max(48),
  fontDisplay: z.string(),
  fontBody: z.string(),
}).partial();

const prefsSchema = z.object({
  currency: z.string(),
  currencyPosition: z.enum(['before', 'after']),
  language: z.enum(['my', 'en']),
}).partial();

export const importSchema = z.object({
  products: z.array(productSchema).optional(),
  customers: z.array(customerSchema).optional(),
  vendors: z.array(vendorSchema).optional(),
  purchases: z.array(purchaseSchema).optional(),
  ledger: z.array(ledgerSchema).optional(),
  invoices: z.array(invoiceSchema).optional(),
  settings: settingsSchema.optional(),
  theme: themeSchema.optional(),
  prefs: prefsSchema.optional(),
  categories: z.array(z.string()).optional(),
  // adminCreds intentionally NOT accepted — see comment above.
}).passthrough();

export type ImportPayload = z.infer<typeof importSchema>;
