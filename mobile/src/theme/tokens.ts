// Unifesto semantic color tokens.
//
// Components should ask for a ROLE (surface, textMuted, accent…) rather than a
// raw hex, so the same component renders correctly in dark and light. The dark
// set reuses the legacy `colors` values, so adopting tokens changes no pixels
// today. Note the legacy names were inverted: legacy `textMuted` (#94a3b8) is
// the brighter grey, so it becomes `textSecondary` here, and legacy
// `textSecondary` (#64748b) becomes `textMuted`. ThemeContext picks the set
// from the user's Appearance choice (light / dark / system).
//
// The legacy `colors` export in ./colors stays as-is for screens that haven't
// migrated yet.

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

  // Brand accent (Unifesto blue) + the text colour that sits on it
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
  bg: '#0b0b0d',
  surface: '#121214',
  elevated: '#1a1a1d',
  border: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(52, 145, 255, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.8)',
  fill: 'rgba(255, 255, 255, 0.06)',
  fillStrong: 'rgba(255, 255, 255, 0.14)',
  pressed: 'rgba(255, 255, 255, 0.05)',

  text: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#8a8a90', // 4.1:1 was under AA; cosmos muted holds 5.7:1 on bg

  accent: '#3491ff',
  accentStrong: '#0062ff',
  accentFg: '#000000',
  accentGradient: ['#3491ff', '#0062ff'] as const,

  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3491ff',

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
  borderStrong: 'rgba(0, 98, 255, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  fill: 'rgba(0, 0, 0, 0.05)',
  fillStrong: 'rgba(0, 0, 0, 0.12)',
  pressed: 'rgba(0, 0, 0, 0.05)',

  text: '#0a0a0b',
  textSecondary: '#52525b',
  textMuted: '#63636a',

  accent: '#0062ff',
  accentStrong: '#0052d9',
  accentFg: '#ffffff',
  accentGradient: ['#3491ff', '#0062ff'] as const,

  success: '#047857',
  warning: '#92400e',
  danger: '#c62828', // with success/warning: AA (4.5:1) on the grey ground, as cosmos
  info: '#0062ff',

  scheme: 'light',
};
