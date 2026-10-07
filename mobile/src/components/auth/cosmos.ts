// "Monochrome cosmos": the 2026 web brand (websites/web/src/app/globals.css),
// ported for the login flow. Black ground, light type, one silver accent; the
// light set flips the same roles exactly like the web's [data-theme="light"].
import { useTokens } from '../../context/ThemeContext';

const dark = {
  bg: '#000000',
  card: '#0a0a0b',
  text: '#ececee',
  muted: '#8a8a90',
  primary: '#e8e8ea',
  primaryFg: '#000000',
  border: 'rgba(255, 255, 255, 0.1)',
  input: 'rgba(255, 255, 255, 0.18)',
  outline: 'rgba(255, 255, 255, 0.28)',
  danger: '#ff6b6b',
  glow: '255, 255, 255',
  scheme: 'dark' as 'dark' | 'light',
};

const light: typeof dark = {
  bg: '#ffffff',
  card: '#f4f4f5',
  text: '#111113',
  muted: '#63636a',
  primary: '#111113',
  primaryFg: '#ffffff',
  border: 'rgba(0, 0, 0, 0.1)',
  input: 'rgba(0, 0, 0, 0.18)',
  outline: 'rgba(0, 0, 0, 0.28)',
  danger: '#d93636',
  glow: '17, 17, 19',
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

/** Web "instrument-panel" radii: near-square, never pills. */
export const cosmosRadius = 6;
