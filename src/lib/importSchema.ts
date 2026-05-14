import { z } from 'zod';

// Backup imports — fully permissive. Accept any backup file shape so users
// can restore from older or partial backups. `adminCreds` is intentionally
// stripped so backups can never overwrite admin login credentials.

const looseObject = z.object({}).passthrough();

const productSchema = looseObject;
const customerSchema = looseObject;
const vendorSchema = looseObject;
const purchaseSchema = looseObject;
const ledgerSchema = looseObject;
const invoiceSchema = looseObject;

const settingsSchema = looseObject;
const themeSchema = looseObject;
const prefsSchema = looseObject;

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
  // adminCreds intentionally NOT accepted.
}).passthrough();

export type ImportPayload = z.infer<typeof importSchema>;
