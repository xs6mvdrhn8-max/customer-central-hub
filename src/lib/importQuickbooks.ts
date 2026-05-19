// QuickBooks importer — supports IIF (tab text), QBO/QFX (OFX), CSV exports.
// QBB/QBW are proprietary binary backups and cannot be parsed in-browser;
// we detect them and return a friendly instruction error.

import { Customer, Vendor, Product, Invoice, InvoiceLine, PurchaseOrder, PurchaseLine, LedgerEntry } from '@/types';

export interface QBImportResult {
  format: 'iif' | 'qbo' | 'csv-customers' | 'csv-vendors' | 'csv-items' | 'csv-transactions' | 'unknown';
  customers: Customer[];
  vendors: Vendor[];
  products: Product[];
  invoices: Invoice[];
  purchases: PurchaseOrder[];
  ledger: LedgerEntry[];
  warnings: string[];
}

const uid = () => Math.random().toString(36).slice(2, 11);
const num = (v: any): number => {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
};
const clean = (s: any) => (s == null ? '' : String(s).trim().replace(/^"|"$/g, ''));

export function detectQuickBooksFormat(filename: string, head: string): QBImportResult['format'] | 'qbb' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.qbb') || lower.endsWith('.qbw') || lower.endsWith('.qbm')) return 'qbb';
  if (lower.endsWith('.iif') || /^!\w+\t/m.test(head)) return 'iif';
  if (lower.endsWith('.qbo') || lower.endsWith('.qfx') || lower.endsWith('.ofx') || /<OFX[> ]/i.test(head) || /OFXHEADER/i.test(head)) return 'qbo';
  if (lower.endsWith('.csv')) {
    const h = head.split(/\r?\n/)[0]?.toLowerCase() || '';
    if (/\b(customer|client)\b/.test(h) && !/qty|item|product/.test(h)) return 'csv-customers';
    if (/\bvendor|supplier\b/.test(h)) return 'csv-vendors';
    if (/\b(item|product|sku|barcode)\b/.test(h) && /(price|rate|cost|amount)/.test(h)) return 'csv-items';
    if (/(invoice|trans|date)/.test(h) && /(amount|total)/.test(h)) return 'csv-transactions';
    return 'csv-items';
  }
  return 'unknown';
}

export async function parseQuickBooksFile(file: File): Promise<QBImportResult> {
  const name = file.name;
  const head = await file.slice(0, 4096).text();
  const fmt = detectQuickBooksFormat(name, head);

  if (fmt === 'qbb') {
    throw new Error(
      'QuickBooks .QBB/.QBW files are proprietary binary backups and cannot be opened directly in the browser. ' +
      'Please open the file in QuickBooks Desktop, then File → Utilities → Export → IIF Files (or export Lists/Reports to CSV), and upload that file here.'
    );
  }
  if (fmt === 'unknown') throw new Error('Unknown QuickBooks file format. Supported: .IIF, .QBO/.QFX, .CSV');

  const text = await file.text();
  switch (fmt) {
    case 'iif': return parseIIF(text);
    case 'qbo': return parseOFX(text);
    default: return parseQuickBooksCSV(text, fmt);
  }
}

// ---------- IIF (tab-delimited, header rows start with !) ----------
function parseIIF(text: string): QBImportResult {
  const result: QBImportResult = {
    format: 'iif', customers: [], vendors: [], products: [],
    invoices: [], purchases: [], ledger: [], warnings: [],
  };
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers: Record<string, string[]> = {};
  type Row = { type: string; cols: string[] };
  const rows: Row[] = [];

  for (const ln of lines) {
    const cells = ln.split('\t');
    const first = cells[0];
    if (!first) continue;
    if (first.startsWith('!')) {
      headers[first.slice(1).toUpperCase()] = cells.slice(1).map((c) => c.toUpperCase());
    } else {
      rows.push({ type: first.toUpperCase(), cols: cells.slice(1) });
    }
  }

  const get = (type: string, row: string[], key: string): string => {
    const h = headers[type];
    if (!h) return '';
    const idx = h.indexOf(key.toUpperCase());
    return idx === -1 ? '' : clean(row[idx]);
  };

  // group TRNS + SPL into transactions
  type Trn = { trns: string[]; spls: string[][] };
  const trns: Trn[] = [];
  let current: Trn | null = null;
  for (const r of rows) {
    if (r.type === 'CUST') {
      const name = get('CUST', r.cols, 'NAME');
      if (!name) continue;
      result.customers.push({
        id: uid(), name,
        phone: get('CUST', r.cols, 'PHONE1') || get('CUST', r.cols, 'PHONE'),
        email: get('CUST', r.cols, 'EMAIL'),
        address: [get('CUST', r.cols, 'BADDR1'), get('CUST', r.cols, 'BADDR2'), get('CUST', r.cols, 'BADDR3')].filter(Boolean).join(', '),
        note: get('CUST', r.cols, 'NOTE'),
      });
    } else if (r.type === 'VEND') {
      const name = get('VEND', r.cols, 'NAME');
      if (!name) continue;
      result.vendors.push({
        id: uid(), name,
        phone: get('VEND', r.cols, 'PHONE1') || get('VEND', r.cols, 'PHONE'),
        email: get('VEND', r.cols, 'EMAIL'),
        address: [get('VEND', r.cols, 'ADDR1'), get('VEND', r.cols, 'ADDR2'), get('VEND', r.cols, 'ADDR3')].filter(Boolean).join(', '),
        note: get('VEND', r.cols, 'NOTE'),
      });
    } else if (r.type === 'INVITEM') {
      const name = get('INVITEM', r.cols, 'NAME');
      if (!name) continue;
      result.products.push({
        id: uid(), name,
        category: get('INVITEM', r.cols, 'INVITEMTYPE') || 'Imported',
        price: num(get('INVITEM', r.cols, 'PRICE')),
        cost: num(get('INVITEM', r.cols, 'COST')),
        stock: num(get('INVITEM', r.cols, 'QNTY') || get('INVITEM', r.cols, 'ONHAND')),
        reorderLevel: num(get('INVITEM', r.cols, 'REORDERPOINT')),
        sku: get('INVITEM', r.cols, 'PARTNUMBER'),
        barcode: get('INVITEM', r.cols, 'BARCODE'),
        description: get('INVITEM', r.cols, 'DESC'),
      });
    } else if (r.type === 'TRNS') {
      current = { trns: r.cols, spls: [] };
      trns.push(current);
    } else if (r.type === 'SPL' && current) {
      current.spls.push(r.cols);
    } else if (r.type === 'ENDTRNS') {
      current = null;
    }
  }

  for (const t of trns) {
    const trnstype = clean(t.trns[(headers['TRNS']?.indexOf('TRNSTYPE') ?? -1)]).toUpperCase();
    const date = clean(t.trns[(headers['TRNS']?.indexOf('DATE') ?? -1)]);
    const name = clean(t.trns[(headers['TRNS']?.indexOf('NAME') ?? -1)]);
    const amount = Math.abs(num(t.trns[(headers['TRNS']?.indexOf('AMOUNT') ?? -1)]));
    const memo = clean(t.trns[(headers['TRNS']?.indexOf('MEMO') ?? -1)]);
    const iso = parseQBDate(date);

    if (trnstype === 'INVOICE' || trnstype === 'CASH SALE' || trnstype === 'SALES RECEIPT') {
      const lines: InvoiceLine[] = t.spls.map((s) => {
        const account = clean(s[(headers['SPL']?.indexOf('ACCNT') ?? -1)]);
        const splMemo = clean(s[(headers['SPL']?.indexOf('MEMO') ?? -1)]);
        const qty = Math.abs(num(s[(headers['SPL']?.indexOf('QNTY') ?? -1)]) || 1);
        const price = Math.abs(num(s[(headers['SPL']?.indexOf('PRICE') ?? -1)]));
        const amt = Math.abs(num(s[(headers['SPL']?.indexOf('AMOUNT') ?? -1)]));
        return { productId: '', productName: splMemo || account || 'Item', qty, price: price || amt / qty, cost: 0 };
      }).filter((l) => l.qty > 0);
      result.invoices.push({
        id: uid(), date: iso, customerName: name || 'Walk-in', saleType: 'cash',
        paidAmount: amount, total: amount, totalCost: 0, lines, note: memo,
      });
    } else if (trnstype === 'BILL' || trnstype === 'PURCHORD') {
      const lines: PurchaseLine[] = t.spls.map((s) => ({
        itemName: clean(s[(headers['SPL']?.indexOf('MEMO') ?? -1)]) || clean(s[(headers['SPL']?.indexOf('ACCNT') ?? -1)]) || 'Item',
        orderedQty: Math.abs(num(s[(headers['SPL']?.indexOf('QNTY') ?? -1)]) || 1),
        receivedQty: trnstype === 'BILL' ? Math.abs(num(s[(headers['SPL']?.indexOf('QNTY') ?? -1)]) || 1) : 0,
        cost: Math.abs(num(s[(headers['SPL']?.indexOf('PRICE') ?? -1)]) || num(s[(headers['SPL']?.indexOf('AMOUNT') ?? -1)])),
      }));
      result.purchases.push({
        id: uid(), vendorName: name || 'Vendor',
        status: trnstype === 'BILL' ? 'received' : 'ordered',
        orderDate: iso, lines, note: memo,
      });
    } else if (amount > 0 && name) {
      // generic A/R or A/P ledger row
      const isReceivable = /INVOICE|PAYMENT|DEPOSIT|CHECK/.test(trnstype);
      result.ledger.push({
        id: uid(), type: isReceivable ? 'receivable' : 'payable',
        name, amount, dueDate: iso, note: `${trnstype} ${memo}`.trim(),
      });
    }
  }

  return result;
}

function parseQBDate(s: string): string {
  if (!s) return new Date().toISOString();
  // QB IIF uses MM/DD/YYYY or M/D/YY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, mm, dd, yy] = m;
    let y = parseInt(yy, 10);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(y, parseInt(mm, 10) - 1, parseInt(dd, 10)));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ---------- OFX / QBO / QFX ----------
function parseOFX(text: string): QBImportResult {
  const result: QBImportResult = {
    format: 'qbo', customers: [], vendors: [], products: [],
    invoices: [], purchases: [], ledger: [], warnings: [],
  };
  // strip headers before <OFX>
  const body = text.slice(Math.max(0, text.indexOf('<OFX')));
  // Normalize SGML to XML by closing simple value tags
  const xml = body.replace(/<([A-Z0-9.]+)>([^<\r\n]*?)(?=\r?\n|<)/g, (_m, tag, val) => `<${tag}>${val.trim()}</${tag}>`);

  const stmttrnRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let m: RegExpExecArray | null;
  while ((m = stmttrnRe.exec(xml))) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}>([^<]*)`, 'i').exec(block);
      return r ? clean(r[1]) : '';
    };
    const amt = num(get('TRNAMT'));
    const datePosted = get('DTPOSTED').slice(0, 8); // YYYYMMDD
    const name = get('NAME') || get('PAYEE') || get('MEMO') || 'Transaction';
    const memo = get('MEMO');
    let iso = new Date().toISOString();
    if (/^\d{8}$/.test(datePosted)) {
      iso = new Date(`${datePosted.slice(0, 4)}-${datePosted.slice(4, 6)}-${datePosted.slice(6, 8)}T00:00:00Z`).toISOString();
    }
    if (amt > 0) {
      // money in — treat as sale
      result.invoices.push({
        id: uid(), date: iso, customerName: name, saleType: 'cash',
        paidAmount: amt, total: amt, totalCost: 0,
        lines: [{ productId: '', productName: memo || name, qty: 1, price: amt, cost: 0 }],
        note: memo,
      });
    } else if (amt < 0) {
      result.ledger.push({
        id: uid(), type: 'payable', name, amount: Math.abs(amt),
        dueDate: iso, note: memo,
      });
    }
  }
  if (result.invoices.length === 0 && result.ledger.length === 0) {
    result.warnings.push('No STMTTRN entries found in OFX file.');
  }
  return result;
}

// ---------- CSV exports ----------
function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

function findCol(headers: string[], ...keys: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const k of keys) {
    const kk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const i = norm.indexOf(kk);
    if (i !== -1) return i;
  }
  for (const k of keys) {
    const kk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const i = norm.findIndex((h) => h.includes(kk));
    if (i !== -1) return i;
  }
  return -1;
}

function parseQuickBooksCSV(text: string, fmt: QBImportResult['format']): QBImportResult {
  const result: QBImportResult = {
    format: fmt, customers: [], vendors: [], products: [],
    invoices: [], purchases: [], ledger: [], warnings: [],
  };
  const rows = csvParse(text);
  if (rows.length < 2) { result.warnings.push('Empty CSV'); return result; }
  const headers = rows[0].map((h) => h.trim());
  const body = rows.slice(1);

  if (fmt === 'csv-customers') {
    const cName = findCol(headers, 'name', 'customer', 'displayname', 'fullname');
    const cPhone = findCol(headers, 'phone', 'mainphone', 'mobile');
    const cEmail = findCol(headers, 'email', 'mainemail');
    const cAddr = findCol(headers, 'address', 'billaddress', 'shipaddress');
    const cNote = findCol(headers, 'note', 'memo');
    for (const r of body) {
      const name = clean(r[cName]); if (!name) continue;
      result.customers.push({ id: uid(), name,
        phone: clean(r[cPhone]), email: clean(r[cEmail]),
        address: clean(r[cAddr]), note: clean(r[cNote]) });
    }
  } else if (fmt === 'csv-vendors') {
    const cName = findCol(headers, 'name', 'vendor', 'supplier', 'displayname');
    const cPhone = findCol(headers, 'phone', 'mainphone');
    const cEmail = findCol(headers, 'email');
    const cAddr = findCol(headers, 'address', 'billaddress');
    const cNote = findCol(headers, 'note', 'memo');
    for (const r of body) {
      const name = clean(r[cName]); if (!name) continue;
      result.vendors.push({ id: uid(), name,
        phone: clean(r[cPhone]), email: clean(r[cEmail]),
        address: clean(r[cAddr]), note: clean(r[cNote]) });
    }
  } else if (fmt === 'csv-items') {
    const cName = findCol(headers, 'name', 'item', 'product', 'itemname');
    const cCat = findCol(headers, 'category', 'type', 'itemtype');
    const cPrice = findCol(headers, 'price', 'salesprice', 'rate', 'unitprice');
    const cCost = findCol(headers, 'cost', 'purchasecost', 'avgcost');
    const cStock = findCol(headers, 'stock', 'qty', 'quantity', 'onhand', 'qtyonhand');
    const cSku = findCol(headers, 'sku', 'partnumber', 'mpn');
    const cBarcode = findCol(headers, 'barcode', 'upc', 'ean');
    const cDesc = findCol(headers, 'description', 'desc');
    const cReorder = findCol(headers, 'reorder', 'reorderpoint', 'reorderlevel');
    for (const r of body) {
      const name = clean(r[cName]); if (!name) continue;
      result.products.push({ id: uid(), name,
        category: clean(r[cCat]) || 'Imported',
        price: num(r[cPrice]), cost: num(r[cCost]),
        stock: num(r[cStock]), reorderLevel: num(r[cReorder]),
        sku: clean(r[cSku]), barcode: clean(r[cBarcode]),
        description: clean(r[cDesc]),
      });
    }
  } else if (fmt === 'csv-transactions') {
    const cDate = findCol(headers, 'date', 'txndate', 'invoicedate');
    const cName = findCol(headers, 'name', 'customer', 'vendor', 'payee');
    const cType = findCol(headers, 'type', 'txntype');
    const cAmount = findCol(headers, 'amount', 'total');
    const cMemo = findCol(headers, 'memo', 'description', 'note');
    for (const r of body) {
      const name = clean(r[cName]); if (!name) continue;
      const amount = num(r[cAmount]); if (!amount) continue;
      const type = clean(r[cType]).toLowerCase();
      const iso = parseQBDate(clean(r[cDate]));
      const memo = clean(r[cMemo]);
      if (type.includes('invoice') || type.includes('sale') || amount > 0) {
        result.invoices.push({
          id: uid(), date: iso, customerName: name, saleType: 'cash',
          paidAmount: Math.abs(amount), total: Math.abs(amount), totalCost: 0,
          lines: [{ productId: '', productName: memo || name, qty: 1, price: Math.abs(amount), cost: 0 }],
          note: memo,
        });
      } else {
        result.ledger.push({
          id: uid(), type: 'payable', name, amount: Math.abs(amount), dueDate: iso, note: memo,
        });
      }
    }
  }
  return result;
}

export function summarize(r: QBImportResult): string {
  return [
    r.customers.length && `${r.customers.length} customers`,
    r.vendors.length && `${r.vendors.length} vendors`,
    r.products.length && `${r.products.length} items`,
    r.invoices.length && `${r.invoices.length} sales`,
    r.purchases.length && `${r.purchases.length} purchases`,
    r.ledger.length && `${r.ledger.length} ledger entries`,
  ].filter(Boolean).join(', ') || 'no records';
}
