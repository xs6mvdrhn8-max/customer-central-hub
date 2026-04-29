// PDF text extraction using pdfjs-dist with a bundled worker (works in Lovable preview).
import * as pdfjsLib from 'pdfjs-dist';
// Vite ?url import gives us a hashed asset URL that works in preview + production.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfPriceRow {
  model: string;          // normalized e.g. P805209
  rawModel: string;       // original token
  price: number;          // wholesale price
  description?: string;
  pageNumber: number;
}

export function normalizeModel(s: string): string {
  return (s || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, ''); // strip dashes, dots, slashes
}

// A "model code" looks like a letter+digits group, possibly with dashes/dots,
// at least 4 alphanumerics total. Examples: P-805209, HT-1234, A1234, 805209.
const MODEL_RE = /\b([A-Z]{1,4}[-./]?\d{3,8}[A-Z0-9-]*|\d{5,8})\b/g;
// Money: 1,234.56 or 1234 or 1.234,56 (we'll handle both styles below).
const MONEY_RE = /([0-9]{1,3}(?:[,. ][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/g;

function parseMoney(token: string): number | null {
  if (!token) return null;
  let s = token.replace(/\s/g, '');
  // If both . and , present, assume the LAST one is the decimal separator.
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      // 1.234,56 -> 1234.56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56 -> 1234.56
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Either thousands "1,234" or decimal "12,5" — if 3 digits after, treat as thousands.
    const after = s.length - lastComma - 1;
    if (after === 3) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface RawLine {
  text: string;
  page: number;
}

async function extractLines(file: File): Promise<RawLine[]> {
  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  const out: RawLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items by their Y coordinate to reconstruct visual lines.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const arr = rows.get(y) ?? [];
      arr.push({ x, str: it.str });
      rows.set(y, arr);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.str);
      const text = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ text, page: p });
    }
  }
  return out;
}

export async function extractPdfPrices(file: File): Promise<PdfPriceRow[]> {
  const lines = await extractLines(file);
  const rows: PdfPriceRow[] = [];

  for (const { text, page } of lines) {
    const upper = text.toUpperCase();
    const models = upper.match(MODEL_RE);
    if (!models) continue;
    const moneyTokens = text.match(MONEY_RE) ?? [];
    // Pick the last money token on the line (typical "wholesale" column is rightmost).
    let price: number | null = null;
    for (let i = moneyTokens.length - 1; i >= 0; i--) {
      const v = parseMoney(moneyTokens[i]);
      if (v !== null && v > 0) { price = v; break; }
    }
    if (price === null) continue;

    // Use the longest model token (more specific).
    const rawModel = [...models].sort((a, b) => b.length - a.length)[0];
    const normalized = normalizeModel(rawModel);
    if (normalized.length < 4) continue;

    rows.push({
      model: normalized,
      rawModel,
      price,
      description: text,
      pageNumber: page,
    });
  }

  // Deduplicate by model — keep the first occurrence (usually first listing).
  const seen = new Map<string, PdfPriceRow>();
  for (const r of rows) {
    if (!seen.has(r.model)) seen.set(r.model, r);
  }
  return [...seen.values()];
}
