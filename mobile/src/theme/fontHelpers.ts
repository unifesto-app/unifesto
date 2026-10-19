// Font family helper for React Native.
//
// Two families, selected by a semantic weight name:
//   • 'heading'                    → Plus Jakarta Sans 500 (headlines / titles /
//                                     hero / big numbers, 18px and up).
//   • 'bold' | 'extrabold'         → DM Sans Bold 700.
//   • 'semibold'                   → DM Sans SemiBold 600.
//   • 'medium'                     → DM Sans Medium 500.
//   • 'primary' | 'normal' | default → DM Sans Regular 400 (body).
//
// Each family is a distinct STATIC face registered in app/_layout.tsx; the
// weight lives in the family name, so we set fontFamily only (never fontWeight,
// which would trigger Android synthetic bolding on an already-weighted face).
//
// There is no app-wide default family: RN Text only inherits fontFamily from a
// parent Text, so every top-level text style must set one (via these helpers or
// cosmos fonts) or it renders in the system font.

import type { TextStyle } from 'react-native';
import {
  typography,
  FONT_HEADING,
  FONT_BODY_REGULAR,
  FONT_BODY_MEDIUM,
  FONT_BODY_SEMIBOLD,
  FONT_BODY_BOLD,
} from './typography';

type Weight =
  | 'heading'
  | 'primary'
  | 'bold'
  | 'normal'
  | '400'
  | '500'
  | '600'
  | '700'
  | 'medium'
  | 'semibold'
  | 'extrabold';

/**
 * Map a semantic weight name to the numeric fontWeight it corresponds to.
 * Real 400/500/600/700 faces exist, so each maps to its own weight.
 */
export function getFontWeight(weight: Weight): TextStyle['fontWeight'] {
  switch (weight) {
    case 'bold':
    case 'extrabold':
    case '700':
      return '700';
    case 'semibold':
    case '600':
      return '600';
    case 'medium':
    case '500':
      return '500';
    case 'heading':
    case 'primary':
    case 'normal':
    case '400':
    default:
      return '400';
  }
}

/**
 * Resolve a semantic weight to the concrete font family that carries it.
 * 'heading' → Plus Jakarta Sans; everything else → the matching DM Sans face.
 */
export function getFontFamily(weight: Weight = 'normal'): string {
  if (weight === 'heading') return FONT_HEADING;
  switch (getFontWeight(weight)) {
    case '700':
      return FONT_BODY_BOLD;
    case '600':
      return FONT_BODY_SEMIBOLD;
    case '500':
      return FONT_BODY_MEDIUM;
    default:
      return FONT_BODY_REGULAR;
  }
}

/**
 * Spread this into a style to set the family. Use `font('heading')` for
 * headlines/titles (Plus Jakarta Sans) and `font()` / `font('medium')` for body.
 *
 * @example
 * const styles = StyleSheet.create({
 *   title: { fontSize: 24, color: colors.text, ...font('heading') },
 *   body: { fontSize: 15, color: colors.text, ...font() },
 * });
 */
export function font(weight: Weight = 'normal'): Pick<TextStyle, 'fontFamily'> {
  return {
    fontFamily: getFontFamily(weight),
  };
}

/**
 * Create a text style with size + family. Pass 'heading' for Plus Jakarta Sans.
 */
export function getTextStyle(
  size: keyof typeof typography.fontSize,
  weight: Weight = 'normal'
) {
  return {
    fontSize: typography.fontSize[size],
    ...font(weight),
  };
}
