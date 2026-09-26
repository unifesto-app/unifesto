// Unifesto Design System - Mobile Theme
// Matching the main website's design tokens and visual language

import { colors, brandGradient, brandGradientStart, brandGradientEnd, brandGradientCSS, gradientTextColors, screenGradient, heroGradient } from './colors';
import { typography, FONT_HEADING, FONT_BODY_REGULAR, FONT_BODY_MEDIUM, FONT_BODY_SEMIBOLD, FONT_BODY_BOLD } from './typography';
import { spacing, borderRadius, shadows } from './spacing';
import { font, getFontFamily, getTextStyle } from './fontHelpers';
import { buttonStyles, blueGradientColors, standardGradientConfig } from './buttonStyles';
import { darkTokens, lightTokens } from './tokens';
export type { Tokens } from './tokens';

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  brandGradient,
  brandGradientStart,
  brandGradientEnd,
  brandGradientCSS,
  gradientTextColors,
  screenGradient,
  heroGradient,
  buttonStyles,
  blueGradientColors,
  standardGradientConfig,
};

export {
  colors, 
  typography, 
  spacing, 
  borderRadius, 
  shadows, 
  brandGradient,
  brandGradientStart,
  brandGradientEnd,
  brandGradientCSS,
  gradientTextColors,
  screenGradient,
  heroGradient,
  font,
  getFontFamily,
  getTextStyle,
  FONT_HEADING,
  FONT_BODY_REGULAR,
  FONT_BODY_MEDIUM,
  FONT_BODY_SEMIBOLD,
  FONT_BODY_BOLD,
  buttonStyles,
  blueGradientColors,
  standardGradientConfig,
  darkTokens,
  lightTokens,
};

export default theme;
