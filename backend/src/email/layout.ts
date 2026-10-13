// The Unifesto email shell and its building blocks, in the web's monochrome
// cosmos theme: content sits straight on the ground (white in light, black in
// dark), raised wells for details, one pill button, the wordmark in ink.
//
// Light is inline on every element, so clients that strip <style> (Gmail
// apps, many webmail views) still get a complete light email. Each themed
// element also carries a token class; the <style> block swaps those to the
// dark palette under prefers-color-scheme (Apple Mail, iOS, Outlook for Mac,
// Hey...) and under Outlook.com's [data-ogsc]/[data-ogsb] dark-mode hooks.
//
// Helpers take HTML. Anything a person typed (names, titles, reasons) must go
// through esc() before it reaches them.

export const WEB = 'https://unifesto.app';
export const SPACE_APP = 'https://space.unifesto.app';
export const APEX = 'https://apex.unifesto.app';
export const SUPPORT = 'support@unifesto.app';

// Same roles as websites/web globals.css (night / night-3 / paper / muted).
const LIGHT = {
  ground: '#ffffff',
  well: '#f4f4f5',
  text: '#111113',
  soft: '#3f3f46',
  muted: '#63636a',
  line: '#e4e4e7',
  btn: '#111113',
  btnText: '#ffffff',
  danger: '#d93636',
  dangerWell: '#fdf0f0',
  successWell: '#eef7f1',
};
const DARK: typeof LIGHT = {
  ground: '#000000',
  well: '#141416',
  text: '#ececee',
  soft: '#b4b4ba',
  muted: '#8a8a90',
  line: '#232327',
  btn: '#e8e8ea',
  btnText: '#000000',
  danger: '#ff6b6b',
  dangerWell: '#2a1315',
  successWell: '#0f1f16',
};
type Token = keyof typeof LIGHT;

/** Inline light colour + the class that flips it in dark mode. */
const bg = (t: Token) => ({ cls: `b-${t}`, css: `background:${LIGHT[t]};` });
const fg = (t: Token) => ({ cls: `c-${t}`, css: `color:${LIGHT[t]};` });

const TOKENS = Object.keys(LIGHT) as Token[];
const darkRules = (scope: string, prop: 'background' | 'color' | 'both') =>
  TOKENS.flatMap((t) => [
    ...(prop !== 'color' ? [`${scope}.b-${t}{background:${DARK[t]} !important;}`] : []),
    ...(prop !== 'background' ? [`${scope}.c-${t}{color:${DARK[t]} !important;}`] : []),
  ]).join('');

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme: light){
.logo-brand{display:none !important;}
.logo-light{display:block !important;max-height:none !important;}
}
@media (prefers-color-scheme: dark){
${darkRules('', 'both')}
.l-line{border-color:${DARK.line} !important;}
.logo-brand{display:none !important;}
.logo-dark{display:block !important;max-height:none !important;}
}
${darkRules('[data-ogsb] ', 'background')}
${darkRules('[data-ogsc] ', 'color')}
[data-ogsc] .logo-brand{display:none !important;}
[data-ogsc] .logo-dark{display:block !important;max-height:none !important;}
`;

const FONT = `'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
// Default logo is a mid-grey wordmark that reads on white and on black, so
// Gmail (which ignores these media queries and darkens colours itself, leaving
// images alone) and other CSS-less clients always show a visible logo.
// Clients that honour the CSS swap it for pure ink (light) or white (dark).
// Served from www directly: the apex domain 308s, which some clients won't follow.
const ASSETS = 'https://www.unifesto.app/email';
const logoImg = (file: string) =>
  `<img src="${ASSETS}/${file}" width="112" height="16" alt="Unifesto" style="display:block;width:112px;height:16px;border:0;">`;
const hidden = (cls: string, file: string) =>
  `<!--[if !mso]><!--><div class="${cls}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${logoImg(file)}</div><!--<![endif]-->`;

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

/**
 * A space's white-label theme for attendee mail (already gated by the caller:
 * on + plan perk + not suspended). Swaps the header, button colour and footer.
 */
export interface EmailBrand {
  name: string;
  logoUrl: string | null;
  color: string | null;
  hidePoweredBy: boolean;
  /** Public space page, for the header link. */
  url: string;
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000000' : '#ffffff';
}

const HEX6 = /^#[0-9a-f]{6}$/i;

/** A full HTML document around `body`. `preheader` is the inbox preview line. */
export function layout(body: string, preheader = '', brand?: EmailBrand | null): string {
  const ground = bg('ground');
  const soft = fg('soft');
  const muted = fg('muted');
  const a = `class="${muted.cls}" style="${muted.css}"`;
  const accent = brand?.color && HEX6.test(brand.color) ? brand.color : null;
  // Buttons are built before the layout knows the brand, so recolour them
  // here: inline for CSS-less clients, and a rule that beats the dark swap.
  if (accent) {
    const ink = contrastText(accent);
    body = body
      .replaceAll(`class="b-btn" style="background:${LIGHT.btn};`, `class="b-btn" style="background:${accent};`)
      .replaceAll(`class="c-btnText" style="color:${LIGHT.btnText};`, `class="c-btnText" style="color:${ink};`);
  }
  const brandStyle = accent
    ? `.b-btn,[data-ogsb] .b-btn{background:${accent} !important;}.c-btnText,[data-ogsc] .c-btnText{color:${contrastText(accent)} !important;}`
    : '';
  const header = brand
    ? `<a href="${esc(brand.url)}" style="text-decoration:none;">${
        brand.logoUrl
          ? `<img src="${esc(brand.logoUrl)}" height="32" alt="${esc(brand.name)}" style="display:block;height:32px;width:auto;max-width:200px;border:0;">`
          : `<span ${themed([fg('text')], `font-family:${FONT};font-size:18px;font-weight:600;`)}>${esc(brand.name)}</span>`
      }</a>`
    : `<a href="${WEB}" style="text-decoration:none;">
        <div class="logo-brand">${logoImg('wordmark-grey.png')}</div>
        ${hidden('logo-light', 'wordmark-black.png')}
        ${hidden('logo-dark', 'wordmark-white.png')}
      </a>`;
  const footer = brand
    ? `Questions? Reply to this email.<br>
      Sent by ${esc(brand.name)}${brand.hidePoweredBy ? '' : ` via <a href="${WEB}" ${a}>Unifesto</a>`} &middot;
      <a href="${WEB}/privacy" ${a}>Privacy</a> &middot;
      <a href="${WEB}/terms" ${a}>Terms</a>`
    : `Questions? Reply to this email or write to <a href="mailto:${SUPPORT}" ${a}>${SUPPORT}</a>.<br>
      <a href="${WEB}" ${a}>Unifesto</a> &middot;
      <a href="${WEB}/privacy" ${a}>Privacy</a> &middot;
      <a href="${WEB}/terms" ${a}>Terms</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<title>${brand ? esc(brand.name) : 'Unifesto'}</title>
<style>${STYLE}${brandStyle}</style>
</head>
<body class="${ground.cls}" style="margin:0;padding:0;${ground.css}-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="${ground.cls}" style="${ground.css}">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 0 32px;">
      ${header}
    </td></tr>
    <tr><td class="${soft.cls}" style="font-family:${FONT};font-size:16px;line-height:1.6;${soft.css}">
      ${body}
    </td></tr>
    <tr><td class="l-line ${muted.cls}" style="padding:24px 0 0;border-top:1px solid ${LIGHT.line};font-family:${FONT};font-size:13px;line-height:1.6;${muted.css}">
      ${footer}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Opening tag pieces for a themed element: class attr + inline style. */
const themed = (tokens: Array<{ cls: string; css: string }>, extra = '') =>
  `class="${tokens.map((t) => t.cls).join(' ')}" style="${tokens.map((t) => t.css).join('')}${extra}"`;

export const h1 = (html: string) =>
  `<h1 ${themed([fg('text')], `margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;`)}>${html}</h1>`;

export const p = (html: string) => `<p style="margin:0 0 16px;">${html}</p>`;

export const small = (html: string) =>
  `<p ${themed([fg('muted')], 'margin:0 0 16px;font-size:14px;')}>${html}</p>`;

/** Secondary inline text (old values, deltas). */
export const faint = (html: string) => `<span ${themed([fg('muted')])}>${html}</span>`;

export const strong = (text: unknown) =>
  `<strong ${themed([fg('text')], 'font-weight:600;')}>${esc(text)}</strong>`;

export const link = (label: string, url: string) =>
  `<a href="${esc(url)}" ${themed([fg('text')], 'text-decoration:underline;')}>${esc(label)}</a>`;

/** Bulletproof pill button (a table cell, so Outlook keeps the fill). */
export const button = (label: string, url: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td ${themed([bg('btn')], 'border-radius:999px;')}>
    <a href="${esc(url)}" ${themed([fg('btnText')], `display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;`)}>${esc(label)}</a>
  </td></tr>
</table>`;

const well = (inner: string, tone: Token = 'well', pad = '20px') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${themed([bg(tone)], 'margin:8px 0 24px;border-radius:14px;')}>
<tr><td style="padding:${pad};font-family:${FONT};">${inner}</td></tr></table>`;

/** Label/value rows in a raised well. Rows with an empty value are dropped. */
export function details(rows: Array<[label: string, valueHtml: string | null | undefined | false]>, title?: string): string {
  const kept = rows.filter(([, v]) => v);
  if (!kept.length && !title) return '';
  const head = title
    ? `<tr><td colspan="2" ${themed([fg('text')], `padding:0 0 ${kept.length ? 12 : 0}px;font-size:17px;line-height:1.4;font-weight:600;`)}>${title}</td></tr>`
    : '';
  const body = kept
    .map(
      ([label, value], i) => `<tr>
  <td valign="top" ${themed([fg('muted')], `padding:${i ? 8 : 0}px 16px 0 0;font-size:14px;`)}>${esc(label)}</td>
  <td valign="top" ${themed([fg('text')], `padding:${i ? 8 : 0}px 0 0;font-size:15px;`)}>${value}</td>
</tr>`,
    )
    .join('');
  return well(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="word-break:break-word;">${head}${body}</table>`,
  );
}

/** A soft callout. `danger` for problems, `success` for good news. */
export function note(html: string, tone: 'neutral' | 'danger' | 'success' = 'neutral'): string {
  const wellTone: Token = tone === 'danger' ? 'dangerWell' : tone === 'success' ? 'successWell' : 'well';
  const color = fg(tone === 'danger' ? 'danger' : 'soft');
  return well(`<div ${themed([color], 'font-size:15px;line-height:1.6;')}>${html}</div>`, wellTone, '16px 20px');
}

/** A one-time code, big and spaced out so it's easy to read and copy. */
export const code = (value: string) =>
  well(
    `<div ${themed([fg('text')], "text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:8px;")}>${esc(value)}</div>`,
  );

/** Check-in QR on a white tile (white in both themes so it always scans). */
export function qr(data: string, ticketCode?: string): string {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=0&data=${encodeURIComponent(data)}`;
  return well(
    `<div align="center">
  <div style="display:inline-block;padding:12px;background:#ffffff;border-radius:14px;"><img src="${src}" width="180" height="180" alt="Check-in QR code" style="display:block;border:0;"></div>
  <div ${themed([fg('muted')], 'padding-top:12px;font-size:14px;')}>Show this at check-in${ticketCode ? `<br><span ${themed([fg('text')], 'font-size:15px;font-weight:600;letter-spacing:1px;')}>${esc(ticketCode)}</span>` : ''}</div>
</div>`,
    'well',
    '20px 16px',
  );
}

export const list = (items: string[]) =>
  items.length
    ? `<ul style="margin:0 0 16px;padding:0 0 0 20px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`
    : '';

export const greet = (name: string | null | undefined) => p(`Hi ${esc(name || 'there')},`);
