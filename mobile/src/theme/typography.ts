import { Platform } from 'react-native';

// Unifesto Typography System
//
// Font families live in theme/cosmos.ts (`cosmosFont`): DM Sans for headlines
// and figures, Hanken Grotesk for text, registered in app/_layout.tsx. This file
// holds the type scale. The logo is a wordmark PNG
// (see components/UnifestoAppWordmark.tsx), not a font.

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

  // Font Weights — the weight lives in the family name (see `cosmosFont` in
  // cosmos.ts), so these numeric values are informational.
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
