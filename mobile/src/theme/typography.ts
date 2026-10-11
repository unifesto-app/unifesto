import { Platform } from 'react-native';

// Unifesto Typography System
//
// Two families:
//   • Plus Jakarta Sans (500 Medium) — headlines, hero text, big numbers/stats,
//     screen titles. Only ever used at 18px and above.
//   • DM Sans (400 / 500 / 600 / 700) — body text, buttons, nav labels, form
//     fields, captions, every other UI string. Each weight is a distinct static
//     face, so emphasis (medium / semibold / bold) renders as a real weight.
//
// The faces are registered in app/_layout.tsx and selected through the theme
// `font(weight)` helper (see fontHelpers.ts). The logo is a wordmark PNG
// (see components/UnifestoAppWordmark.tsx), not a font.

// Central font-family constants. Prefer the `font()` / `font('heading')`
// helpers in styles, but these are exported for anywhere a raw family string
// is needed.
export const FONT_HEADING = 'PlusJakartaSans-Medium';
export const FONT_BODY_REGULAR = 'DMSans';
export const FONT_BODY_MEDIUM = 'DMSans-Medium';
export const FONT_BODY_SEMIBOLD = 'DMSans-SemiBold';
export const FONT_BODY_BOLD = 'DMSans-Bold';

// Global type scale. Text was running a touch large, so every size is nudged
// down via a single factor. Android also renders the same pt visually larger
// than iOS, so it gets an extra step down on top of the shared reduction.
// Tune FONT_SCALE / FONT_SCALE_ANDROID to resize the whole app's type.
const FONT_SCALE = 0.92;
const FONT_SCALE_ANDROID = 0.9;
const scaleFont = (size: number): number => {
  const factor = FONT_SCALE * (Platform.OS === 'android' ? FONT_SCALE_ANDROID : 1);
  // Never below 11pt: the platform minimum for legible text (Apple HIG › Typography).
  return Math.max(11, Math.round(size * factor));
};

export const typography = {
  // Font Families — DM Sans (body, 400/500/600/700) + Plus Jakarta Sans (headings).
  fontFamily: {
    // DM Sans body faces, one static family per installed weight.
    primary: FONT_BODY_REGULAR,     // 400
    medium: FONT_BODY_MEDIUM,       // 500
    semibold: FONT_BODY_SEMIBOLD,   // 600
    bold: FONT_BODY_BOLD,           // 700
    // Plus Jakarta Sans — headings/hero/screen titles/big numbers, 18px and up.
    heading: FONT_HEADING,
  },

  // Font Sizes — scaled down globally via scaleFont (see FONT_SCALE above), with
  // an extra reduction on Android so text doesn't render oversized there.
  fontSize: {
    xs: scaleFont(11),
    sm: scaleFont(13),
    base: scaleFont(15),
    lg: scaleFont(17),
    xl: scaleFont(20),
    '2xl': scaleFont(24),
    '3xl': scaleFont(28),
    '4xl': scaleFont(32),
    '5xl': scaleFont(40),
    '6xl': scaleFont(48),
    '7xl': scaleFont(56),
    '8xl': scaleFont(64),
  },

  // Font Weights — 400/500/600/700 have real faces; the weight lives in the
  // family name (see fontHelpers), so these numeric values are informational.
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '700' as const,
  },

  // Line Heights
  lineHeight: {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Letter Spacing
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 2,
  },
};
