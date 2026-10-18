import { join } from 'path';
import { existsSync } from 'fs';

/**
 * The curated set of fonts an organiser can pick for certificate text. Each is
 * bundled as static TTFs under `assets/certificate-fonts` (Regular + Bold;
 * single-weight script fonts reuse Regular for bold). Both renderers draw from
 * this one registry so a PDF and its PNG use identical type.
 *
 * `Helvetica` is the default and needs no file — pdfkit ships it and node-canvas
 * maps it to the system sans-serif.
 */
export interface FontDef {
  /** Family name used for registration + CSS `font-family`. */
  family: string;
  /** Bucket shown in the designer's font picker. */
  category: 'Sans' | 'Serif' | 'Display' | 'Script';
  /** TTF filenames, or null for the built-in Helvetica. */
  regular: string | null;
  bold: string | null;
}

export const CERTIFICATE_FONTS: FontDef[] = [
  { family: 'Helvetica', category: 'Sans', regular: null, bold: null },
  { family: 'Montserrat', category: 'Sans', regular: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf' },
  { family: 'Poppins', category: 'Sans', regular: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf' },
  { family: 'Roboto', category: 'Sans', regular: 'Roboto-Regular.ttf', bold: 'Roboto-Regular.ttf' },
  { family: 'Lato', category: 'Sans', regular: 'Lato-Regular.ttf', bold: 'Lato-Regular.ttf' },
  { family: 'Raleway', category: 'Sans', regular: 'Raleway-Regular.ttf', bold: 'Raleway-Regular.ttf' },
  { family: 'Oswald', category: 'Display', regular: 'Oswald-Regular.ttf', bold: 'Oswald-Bold.ttf' },
  { family: 'Bebas Neue', category: 'Display', regular: 'BebasNeue-Regular.ttf', bold: 'BebasNeue-Regular.ttf' },
  { family: 'Playfair Display', category: 'Serif', regular: 'PlayfairDisplay-Regular.ttf', bold: 'PlayfairDisplay-Bold.ttf' },
  { family: 'Lora', category: 'Serif', regular: 'Lora-Regular.ttf', bold: 'Lora-Bold.ttf' },
  { family: 'Merriweather', category: 'Serif', regular: 'Merriweather-Regular.ttf', bold: 'Merriweather-Bold.ttf' },
  { family: 'Cinzel', category: 'Serif', regular: 'Cinzel-Regular.ttf', bold: 'Cinzel-Regular.ttf' },
  { family: 'Cormorant Garamond', category: 'Serif', regular: 'CormorantGaramond-Regular.ttf', bold: 'CormorantGaramond-Regular.ttf' },
  { family: 'EB Garamond', category: 'Serif', regular: 'EBGaramond-Regular.ttf', bold: 'EBGaramond-Regular.ttf' },
  // Script / cursive — single-weight; "bold" reuses the regular face.
  { family: 'Great Vibes', category: 'Script', regular: 'GreatVibes-Regular.ttf', bold: 'GreatVibes-Regular.ttf' },
  { family: 'Pacifico', category: 'Script', regular: 'Pacifico-Regular.ttf', bold: 'Pacifico-Regular.ttf' },
  { family: 'Dancing Script', category: 'Script', regular: 'DancingScript-Regular.ttf', bold: 'DancingScript-Regular.ttf' },
  { family: 'Sacramento', category: 'Script', regular: 'Sacramento-Regular.ttf', bold: 'Sacramento-Regular.ttf' },
  { family: 'Allura', category: 'Script', regular: 'Allura-Regular.ttf', bold: 'Allura-Regular.ttf' },
  { family: 'Parisienne', category: 'Script', regular: 'Parisienne-Regular.ttf', bold: 'Parisienne-Regular.ttf' },
  { family: 'Satisfy', category: 'Script', regular: 'Satisfy-Regular.ttf', bold: 'Satisfy-Regular.ttf' },
  { family: 'Kaushan Script', category: 'Script', regular: 'KaushanScript-Regular.ttf', bold: 'KaushanScript-Regular.ttf' },
];

export const DEFAULT_FONT_FAMILY = 'Helvetica';

/** The families the API accepts (used by DTO validation + the designer). */
export const CERTIFICATE_FONT_FAMILIES = CERTIFICATE_FONTS.map((f) => f.family);

/** Absolute path to the bundled fonts, resolved from the backend root. */
export const FONT_DIR = join(process.cwd(), 'assets', 'certificate-fonts');

/** Absolute TTF path for a family + weight, or null when the file is absent. */
export function fontFilePath(
  family: string,
  bold: boolean,
): string | null {
  const def = CERTIFICATE_FONTS.find((f) => f.family === family);
  const file = def ? (bold ? def.bold : def.regular) : null;
  if (!file) return null;
  const full = join(FONT_DIR, file);
  return existsSync(full) ? full : null;
}

/**
 * Noto Sans faces for Indian scripts (B19). Every curated font above is
 * Latin-only, so a name like "प्रिया" or "ప్రియ" drew as empty boxes. A field
 * whose text uses one of these scripts switches to the matching face. The
 * files are optional: when one isn't bundled the field renders as before.
 */
export const SCRIPT_FONTS: { family: string; range: RegExp; regular: string; bold: string }[] = [
  ['Devanagari', /[\u0900-\u097F]/],
  ['Bengali', /[\u0980-\u09FF]/],
  ['Gurmukhi', /[\u0A00-\u0A7F]/],
  ['Gujarati', /[\u0A80-\u0AFF]/],
  ['Oriya', /[\u0B00-\u0B7F]/],
  ['Tamil', /[\u0B80-\u0BFF]/],
  ['Telugu', /[\u0C00-\u0C7F]/],
  ['Kannada', /[\u0C80-\u0CFF]/],
  ['Malayalam', /[\u0D00-\u0D7F]/],
].map(([script, range]) => ({
  family: `Noto Sans ${script}`,
  range: range as RegExp,
  regular: `NotoSans${script}-Regular.ttf`,
  bold: `NotoSans${script}-Bold.ttf`,
}));

/** The bundled Noto face for the first Indian script in `text`, if any. */
export function scriptFontFor(text: string, bold: boolean): { family: string; path: string } | null {
  for (const f of SCRIPT_FONTS) {
    if (!f.range.test(text)) continue;
    const full = [bold ? f.bold : f.regular, f.regular]
      .map((file) => join(FONT_DIR, file))
      .find((path) => existsSync(path));
    return full ? { family: f.family, path: full } : null;
  }
  return null;
}

/** Resolve an untrusted family to a known one (default when unrecognised). */
export function normaliseFamily(family: string | undefined): string {
  return family && CERTIFICATE_FONT_FAMILIES.includes(family)
    ? family
    : DEFAULT_FONT_FAMILY;
}
