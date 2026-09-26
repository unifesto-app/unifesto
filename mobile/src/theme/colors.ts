// Unifesto Brand Colors - Matching main website design system

export const colors = {
  // Primary Brand Colors
  primary: '#3491ff',
  primaryBright: '#0062ff',
  primaryDark: '#0052d9',

  // Background
  background: '#0b0b0d',
  backgroundSecondary: '#121214',

  // Text
  text: '#ffffff',
  textMuted: '#94a3b8',
  textSecondary: '#64748b',

  // Borders & Dividers
  border: 'rgba(52, 145, 255, 0.3)',
  borderLight: 'rgba(255, 255, 255, 0.1)',
  borderMuted: 'rgba(255, 255, 255, 0.05)',

  // Cards & Surfaces
  card: '#121214',
  cardHover: 'rgba(255, 255, 255, 0.05)',

  // Status Colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3491ff',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.8)',
  overlayLight: 'rgba(0, 0, 0, 0.6)',

  // Gradients
  gradientStart: '#3491ff',
  gradientEnd: '#0062ff',
};

// Light counterpart of the legacy palette, for screens still on `colors`
// (ThemeContext swaps it in). Same shape; values mirror `lightTokens`. Note the
// legacy inversion: `textMuted` is the brighter grey, `textSecondary` the dimmer.
export const lightColors: typeof colors = {
  primary: '#0062ff',
  primaryBright: '#0062ff',
  primaryDark: '#0052d9',

  background: '#f2f2f5',
  backgroundSecondary: '#ffffff',

  text: '#0a0a0b',
  textMuted: '#52525b',
  textSecondary: '#71717a',

  border: 'rgba(0, 98, 255, 0.3)',
  borderLight: 'rgba(0, 0, 0, 0.08)',
  borderMuted: 'rgba(0, 0, 0, 0.05)',

  card: '#ffffff',
  cardHover: 'rgba(0, 0, 0, 0.04)',

  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
  info: '#0062ff',

  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  gradientStart: '#3491ff',
  gradientEnd: '#0062ff',
};

// Brand gradient for LinearGradient component
// Usage: <LinearGradient colors={brandGradient} start={brandGradientStart} end={brandGradientEnd}>
export const brandGradient: readonly [string, string] = ['#3491ff', '#0062ff'] as const;
export const brandGradientStart = { x: 0, y: 0 };
export const brandGradientEnd = { x: 1, y: 1 }; // 135deg equivalent

// Full-screen backdrop shared across all four tab screens (pair with
// locations={[0, 0.45, 1]}): a subtle top-to-bottom lift into the canvas. The
// top stop sits at the card colour (#121214) — never lighter — so cards keep
// their contrast and never dissolve into the background near the top.
export const screenGradient: readonly [string, string, string] = ['#121214', '#0e0e10', '#0b0b0d'] as const;
// Hero band gradient sitting over the backdrop for greeting headers.
export const heroGradient: readonly [string, string] = ['#1a1a1d', '#0e0e10'] as const;

// Brand gradient for CSS (web/style strings)
export const brandGradientCSS = 'linear-gradient(135deg, #3491ff, #0062ff)';

// Gradient for text (use with special styling)
export const gradientTextColors = {
  start: '#3491ff',
  end: '#0062ff',
};
