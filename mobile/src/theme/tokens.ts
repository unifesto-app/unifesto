// Semantic tokens for native chrome and shared surfaces (navigation theme, tab
// bars, CardBackdrop), in Unifesto Horizon values. Screens read cosmos.ts.
// ThemeContext picks the set from the user's Appearance choice.

export interface Tokens {
  // Surfaces
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  borderStrong: string;
  overlay: string;
  /** Subtle neutral wash: chips, inputs, tracks, inner dividers. */
  fill: string;
  /** Stronger neutral wash: unchecked boxes, switch tracks, secondary buttons. */
  fillStrong: string;
  /** Row / tile highlight while pressed. */
  pressed: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Accent: monochrome (silver by night, ink by day) + the text colour that sits on it
  accent: string;
  accentStrong: string;
  accentFg: string;
  accentGradient: readonly [string, string];

  // Semantic status
  success: string;
  warning: string;
  danger: string;
  info: string;

  /** Which native chrome (status bar, keyboard, menus) matches this set. */
  scheme: 'dark' | 'light';
}

// Soft charcoal rather than pure black: OLED black made the canvas feel like a
// void and flattened elevation. Cards still lift by stepping lighter.
export const darkTokens: Tokens = {
  bg: '#000000',
  surface: '#0a0a0b',
  /** Borderless cards: the same lift as cosmos `raised`. */
  elevated: '#141416',
  border: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(255, 255, 255, 0.28)',
  overlay: 'rgba(0, 0, 0, 0.8)',
  fill: 'rgba(255, 255, 255, 0.06)',
  fillStrong: 'rgba(255, 255, 255, 0.14)',
  pressed: 'rgba(255, 255, 255, 0.05)',

  text: '#ececee',
  textSecondary: '#b4b4ba',
  textMuted: '#8a8a90', // 4.1:1 was under AA; cosmos muted holds 5.7:1 on bg

  accent: '#e8e8ea',
  accentStrong: '#ffffff',
  accentFg: '#000000',
  accentGradient: ['#e8e8ea', '#e8e8ea'] as const,

  success: '#90e4c1',
  warning: '#f59e0b',
  danger: '#ec2f58',
  info: '#90d5ff',

  scheme: 'dark',
};

// Light mirrors dark's elevation order: cards are borderless, so they must be
// WHITER than a softly grey canvas to lift off it (iOS grouped-list model).
// `surface` sits between the two for pills on the canvas and thumbs in cards.
export const lightTokens: Tokens = {
  bg: '#f2f2f5',
  surface: '#e9e9ee',
  elevated: '#ffffff',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.28)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  fill: 'rgba(0, 0, 0, 0.05)',
  fillStrong: 'rgba(0, 0, 0, 0.12)',
  pressed: 'rgba(0, 0, 0, 0.05)',

  text: '#111113',
  textSecondary: '#3f3f46',
  textMuted: '#63636a',

  accent: '#111113',
  accentStrong: '#000000',
  accentFg: '#ffffff',
  accentGradient: ['#111113', '#111113'] as const,

  success: '#15745a',
  warning: '#92400e',
  danger: '#be123c', // with success/warning: AA (4.5:1) on the grey ground, as cosmos
  info: '#0369a1',

  scheme: 'light',
};
