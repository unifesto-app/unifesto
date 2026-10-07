// "Monochrome cosmos": the 2026 web brand (websites/web/src/app/globals.css),
// ported for the login, splash and Home. Black ground, light type, one silver accent; the
// light set flips the same roles exactly like the web's [data-theme="light"].
import { useTokens } from '../context/ThemeContext';

const dark = {
  bg: '#000000',
  card: '#0a0a0b',
  /** Event / content cards (the web's night-3). */
  raised: '#141416',
  text: '#ececee',
  /** Secondary text, between text and muted (the web's paper/65). */
  soft: '#b4b4ba',
  muted: '#8a8a90',
  primary: '#e8e8ea',
  primaryFg: '#000000',
  border: 'rgba(255, 255, 255, 0.1)',
  input: 'rgba(255, 255, 255, 0.18)',
  outline: 'rgba(255, 255, 255, 0.28)',
  danger: '#ff6b6b',
  glow: '255, 255, 255',
  /** Faint silver wash for highlighted cards (the web's rgb(var(--glow) / 0.06)). */
  tint: 'rgba(255, 255, 255, 0.06)',
  /** Cover placeholder when an image is missing: the web's night-3 field. */
  fallback: ['#1c1c20', '#0a0a0b'] as [string, string],
  scheme: 'dark' as 'dark' | 'light',
};

const light: typeof dark = {
  bg: '#ffffff',
  card: '#f4f4f5',
  raised: '#f4f4f5',
  text: '#111113',
  soft: '#3f3f46',
  muted: '#63636a',
  primary: '#111113',
  primaryFg: '#ffffff',
  border: 'rgba(0, 0, 0, 0.1)',
  input: 'rgba(0, 0, 0, 0.18)',
  outline: 'rgba(0, 0, 0, 0.28)',
  danger: '#d93636',
  glow: '17, 17, 19',
  tint: 'rgba(0, 0, 0, 0.04)',
  fallback: ['#e4e4e7', '#f4f4f5'],
  scheme: 'light',
};

export type Cosmos = typeof dark;

export function useCosmos(): Cosmos {
  return useTokens().scheme === 'dark' ? dark : light;
}

/** Families registered in app/_layout.tsx. Michroma has one weight: never bold it. */
export const cosmosFont = {
  display: { fontFamily: 'Michroma', letterSpacing: 0.3 },
  body: { fontFamily: 'HankenGrotesk' },
  strong: { fontFamily: 'HankenGrotesk-SemiBold' },
} as const;

/** Controls (fields, buttons, segments): soft, rounded corners. Never square boxes. */
export const cosmosRadius = 14;
/** Cards and covers. */
export const cosmosCardRadius = 20;
