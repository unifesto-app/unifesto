// The Unifesto email shell and its building blocks. Monochrome like the web
// brand: white card on a pale grey page, near-black type, one dark pill button,
// the blue wordmark as the only colour. Everything is inline-styled tables
// because Gmail drops <style> blocks in many contexts and Outlook ignores most
// layout CSS, so classes and gradients don't survive the trip.
//
// Helpers take HTML. Anything a person typed (names, titles, reasons) must go
// through esc() before it reaches them.

export const WEB = 'https://unifesto.app';
export const SPACE_APP = 'https://space.unifesto.app';
export const APEX = 'https://apex.unifesto.app';
export const SUPPORT = 'support@unifesto.app';

const C = {
  page: '#f4f4f5',
  card: '#ffffff',
  well: '#f4f4f5',
  text: '#111113',
  soft: '#3f3f46',
  muted: '#63636a',
  line: '#e4e4e7',
  link: '#0062ff',
  danger: '#b42318',
  dangerWell: '#fdf0ef',
  successWell: '#edf7f0',
};
const FONT = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const LOGO = `${WEB}/UnifestoAppWordmark.png`;

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ₹1,234 or ₹1,234.50, Indian grouping. */
export const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** A full HTML document around `body`. `preheader` is the inbox preview line. */
export function layout(body: string, preheader = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<title>Unifesto</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 20px;">
      <a href="${WEB}" style="text-decoration:none;"><img src="${LOGO}" width="112" alt="Unifesto" style="display:block;width:112px;height:auto;border:0;"></a>
    </td></tr>
    <tr><td style="background:${C.card};border-radius:20px;padding:32px 24px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.soft};">
      ${body}
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};">
      Questions? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:${C.muted};">${SUPPORT}</a>.<br>
      <a href="${WEB}" style="color:${C.muted};">Unifesto</a> &middot;
      <a href="${WEB}/privacy" style="color:${C.muted};">Privacy</a> &middot;
      <a href="${WEB}/terms" style="color:${C.muted};">Terms</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export const h1 = (html: string) =>
  `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:600;color:${C.text};">${html}</h1>`;

export const p = (html: string) => `<p style="margin:0 0 16px;">${html}</p>`;

export const small = (html: string) =>
  `<p style="margin:0 0 16px;font-size:14px;color:${C.muted};">${html}</p>`;

export const strong = (text: unknown) =>
  `<strong style="color:${C.text};font-weight:600;">${esc(text)}</strong>`;

export const link = (label: string, url: string) =>
  `<a href="${esc(url)}" style="color:${C.link};text-decoration:underline;">${esc(label)}</a>`;

/** Bulletproof pill button (a table cell, so Outlook keeps the fill). */
export const button = (label: string, url: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td style="background:${C.text};border-radius:999px;">
    <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
  </td></tr>
</table>`;

/** Label/value rows in a grey well. Rows with an empty value are dropped. */
export function details(rows: Array<[label: string, valueHtml: string | null | undefined | false]>, title?: string): string {
  const kept = rows.filter(([, v]) => v);
  if (!kept.length && !title) return '';
  const head = title
    ? `<tr><td colspan="2" style="padding:0 0 ${kept.length ? 12 : 0}px;font-size:17px;line-height:1.4;font-weight:600;color:${C.text};">${title}</td></tr>`
    : '';
  const body = kept
    .map(
      ([label, value], i) => `<tr>
  <td valign="top" style="padding:${i ? 8 : 0}px 16px 0 0;font-size:14px;color:${C.muted};">${esc(label)}</td>
  <td valign="top" style="padding:${i ? 8 : 0}px 0 0;font-size:15px;color:${C.text};">${value}</td>
</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;background:${C.well};border-radius:14px;">
<tr><td style="padding:20px;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="word-break:break-word;">${head}${body}</table>
</td></tr></table>`;
}

/** A soft callout. `danger` for problems, `success` for good news. */
export function note(html: string, tone: 'neutral' | 'danger' | 'success' = 'neutral'): string {
  const bg = tone === 'danger' ? C.dangerWell : tone === 'success' ? C.successWell : C.well;
  const color = tone === 'danger' ? C.danger : C.soft;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;background:${bg};border-radius:14px;">
<tr><td style="padding:16px 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${color};">${html}</td></tr></table>`;
}

/** A one-time code, big and spaced out so it's easy to read and copy. */
export const code = (value: string) =>
  `<div style="margin:8px 0 24px;padding:20px;background:${C.well};border-radius:14px;text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:8px;color:${C.text};">${esc(value)}</div>`;

/** Check-in QR on a white tile, with the ticket code under it when there is one. */
export function qr(data: string, ticketCode?: string): string {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=0&data=${encodeURIComponent(data)}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;background:${C.well};border-radius:14px;">
<tr><td align="center" style="padding:20px 16px;font-family:${FONT};">
  <div style="display:inline-block;padding:12px;background:#ffffff;border-radius:14px;"><img src="${src}" width="180" height="180" alt="Check-in QR code" style="display:block;border:0;"></div>
  <div style="padding-top:12px;font-size:14px;color:${C.muted};">Show this at check-in${ticketCode ? `<br><span style="font-size:15px;font-weight:600;letter-spacing:1px;color:${C.text};">${esc(ticketCode)}</span>` : ''}</div>
</td></tr></table>`;
}

export const list = (items: string[]) =>
  items.length
    ? `<ul style="margin:0 0 16px;padding:0 0 0 20px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`
    : '';

export const greet = (name: string | null | undefined) => p(`Hi ${esc(name || 'there')},`);
