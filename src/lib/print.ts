// Reusable print engine — renders an HTML payload inside a hidden iframe
// and triggers the browser's native print dialog. Works fully offline.

interface PrintHeader {
  storeName: string;
  storeNote?: string;
  logoUrl?: string;
}

const baseStyles = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans Myanmar', 'Padauk', system-ui, -apple-system, Segoe UI, sans-serif;
    color: #111;
    margin: 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.4;
  }
  h1, h2, h3 { margin: 0 0 6px; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; }
  h3 { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .right { text-align: right; }
  .center { text-align: center; }
  .muted { color: #666; font-size: 11px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; margin-bottom: 16px; }
  .header img { max-height: 56px; max-width: 120px; object-fit: contain; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .totals tr td { border: none; padding: 4px 0; }
  .totals tr td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .grand { font-weight: 700; font-size: 14px; border-top: 1px solid #111 !important; padding-top: 8px !important; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px dashed #999; font-size: 10px; color: #666; text-align: center; }
  .stamp { margin-top: 28px; display: flex; justify-content: space-between; gap: 32px; font-size: 11px; }
  .stamp > div { flex: 1; border-top: 1px solid #444; padding-top: 6px; text-align: center; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; background: #eef; font-size: 10px; }
`;

export function printHtml(bodyHtml: string, title: string, header?: PrintHeader): void {
  const headerHtml = header
    ? `<div class="header">
        <div>
          <h1>${escapeHtml(header.storeName)}</h1>
          ${header.storeNote ? `<p class="muted">${escapeHtml(header.storeNote)}</p>` : ''}
        </div>
        ${header.logoUrl ? `<img src="${escapeAttr(header.logoUrl)}" alt="logo" />` : ''}
      </div>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;600;700&display=swap" />
    <style>${baseStyles}</style></head>
    <body>${headerHtml}${bodyHtml}
      <div class="footer">${escapeHtml(title)} · ${new Date().toLocaleString()}</div>
    </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  // Wait for fonts/images to settle
  setTimeout(trigger, 350);
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s: unknown): string {
  return escapeHtml(s);
}
