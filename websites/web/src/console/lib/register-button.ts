/**
 * The paste-in Register button an organiser puts on their own website
 * (Tracking > On your website). Pure, so the escaping is testable.
 */

/** Safe inside a double-quoted HTML attribute. */
const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
/** Safe as HTML text. */
const text = (v: string) => attr(v).replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RADIUS = { pill: "999px", rounded: "8px", square: "0" } as const;
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

/** The button's inline style, shared by the snippet and the console preview. */
function buttonCss(look: ButtonLook): string {
  return [
    "display:inline-block",
    "padding:12px 24px",
    `border-radius:${RADIUS[look.shape] ?? RADIUS.pill}`,
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
export const registerButtonHtml = (href: string, look: ButtonLook = DEFAULT_BUTTON) =>
  `<a href="${attr(href)}" style="${attr(buttonCss(look))}">${text(look.label.trim().slice(0, 60) || DEFAULT_BUTTON.label)}</a>`;
