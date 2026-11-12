/**
 * The paste-in Register button an organiser puts on their own website
 * (Tracking > On your website). Pure, so the escaping is testable.
 */

/** Safe inside a double-quoted HTML attribute. */
const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
/** Safe as HTML text. */
const text = (v: string) => attr(v).replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const RADIUS = { pill: "999px", rounded: "8px", square: "0" } as const;
export type ButtonShape = keyof typeof RADIUS;
export interface ButtonLook {
  label: string;
  background: string;
  color: string;
  shape: ButtonShape;
}
/** Horizon ink by default; the organiser can match their own site. */
export const DEFAULT_BUTTON: ButtonLook = { label: "Register on Unifesto", background: "#111113", color: "#ffffff", shape: "pill" };

const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
/** Label text without control or bidi-override characters (no right-to-left spoofing). */
const plain = (v: string, max: number) =>
  v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max);

/** The button's inline style, shared by the snippet and the console preview. */
function buttonCss(look: ButtonLook): string {
  return [
    "display:inline-block",
    "padding:12px 24px",
    `border-radius:${Object.hasOwn(RADIUS, look.shape) ? RADIUS[look.shape] : RADIUS.pill}`,
    `background:${hex(look.background, DEFAULT_BUTTON.background)}`,
    `color:${hex(look.color, DEFAULT_BUTTON.color)}`,
    "font:600 16px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif",
    "text-decoration:none",
  ].join(";");
}

/**
 * The register button for an organiser's own website: system font (their site
 * won't have ours), same tab so "Back to" returns. Colours are hex only and the
 * label is escaped, so nothing the organiser types can break out of the tag.
 */
export const registerButtonHtml = (href: string, look: ButtonLook = DEFAULT_BUTTON, embed = false) =>
  `<a href="${attr(href)}"${embed ? " data-unifesto-event" : ""} style="${attr(buttonCss(look))}">${text(plain(look.label, 60) || DEFAULT_BUTTON.label)}</a>`;

/**
 * The same button run by embed.js (K21): checkout opens in a popup and the
 * page gets a "unifesto:registered" event. embed.js adds ?return= itself.
 */
export const popupButtonHtml = (origin: string, href: string, look: ButtonLook = DEFAULT_BUTTON) =>
  `<script src="${attr(origin)}/embed.js" async></script>\n${registerButtonHtml(href, look, true)}`;

/**
 * The event card iframe (K21), tagged with the site so its sign-ups show as
 * their own source. Its Register button takes the same look as the paste-in
 * button; only what differs from the default goes in the URL.
 */
export const cardIframeHtml = (
  origin: string,
  slug: string,
  source: string,
  theme: "light" | "dark",
  title: string,
  look: ButtonLook = DEFAULT_BUTTON,
) => {
  const q = new URLSearchParams({ source, theme });
  const label = plain(look.label, 40);
  if (label && label !== DEFAULT_BUTTON.label) q.set("label", label);
  if (hex(look.background, "") && look.background.toLowerCase() !== DEFAULT_BUTTON.background) q.set("bg", look.background.slice(1));
  if (hex(look.color, "") && look.color.toLowerCase() !== DEFAULT_BUTTON.color) q.set("fg", look.color.slice(1));
  if (look.shape !== DEFAULT_BUTTON.shape) q.set("shape", look.shape);
  return `<iframe src="${attr(`${origin}/embed/event/${encodeURIComponent(slug)}?${q}`)}" title="${attr(title)}" width="100%" height="560" style="border:0;max-width:448px" loading="lazy"></iframe>`;
};

/** The card's own reading of those params: hex colours, a known shape and a short label, or nothing. */
export function cardButtonLook(q: { label?: unknown; bg?: unknown; fg?: unknown; shape?: unknown }) {
  // Query params: a repeated one arrives as an array, so anything but a string is ignored.
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const colour = (v: unknown) => {
    const s = str(v);
    return s && /^[0-9a-f]{6}$/i.test(s) ? `#${s}` : undefined;
  };
  const shape = str(q.shape);
  return {
    label: plain(str(q.label) ?? "", 40) || "Register",
    style: {
      background: colour(q.bg),
      color: colour(q.fg),
      borderRadius: shape && Object.hasOwn(RADIUS, shape) ? RADIUS[shape as ButtonShape] : undefined,
    },
  };
}
