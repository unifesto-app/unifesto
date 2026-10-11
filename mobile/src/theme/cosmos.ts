// "Monochrome cosmos": the 2026 web brand (websites/web/src/app/globals.css),
// ported for the login, splash and Home. Black ground, light type, one silver accent; the
// light set flips the same roles exactly like the web's [data-theme="light"].
import React, { createContext, useContext, useMemo } from 'react';
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
  /** Amber for counts and other text that needs attention; the light value holds 4.5:1 on cards. */
  warn: '#f59e0b',
  glow: '255, 255, 255',
  /** Faint silver wash for highlighted cards (the web's rgb(var(--glow) / 0.06)). */
  tint: 'rgba(255, 255, 255, 0.06)',
  /** Cover placeholder when an image is missing: the web's night-3 field. */
  fallback: ['#1c1c20', '#0a0a0b'] as [string, string],
  /** Green for done states (Checked in); the light value holds 4.5:1 on its own tinted chip. */
  success: '#10b981',
  scheme: 'dark' as 'dark' | 'light',
};

// Light follows the app's grouped-list model (tokens.ts): a soft grey ground with
// WHITE cards, so borderless cards (CardBackdrop paints tokens.elevated #fff) lift off it.
const light: typeof dark = {
  bg: '#f2f2f5',
  card: '#ffffff',
  raised: '#ffffff',
  text: '#111113',
  soft: '#3f3f46',
  muted: '#63636a',
  primary: '#111113',
  primaryFg: '#ffffff',
  border: 'rgba(0, 0, 0, 0.1)',
  input: 'rgba(0, 0, 0, 0.18)',
  outline: 'rgba(0, 0, 0, 0.28)',
  /** #d93636 was 4.15:1 on the grey ground; this holds 5:1 on it, 5.6:1 on cards. */
  danger: '#c62828',
  warn: '#92400e',
  glow: '17, 17, 19',
  tint: 'rgba(0, 0, 0, 0.04)',
  fallback: ['#e4e4e7', '#f4f4f5'],
  success: '#047857',
  scheme: 'light',
};

export type Cosmos = typeof dark;

export const cosmosFor = (scheme: 'dark' | 'light'): Cosmos => (scheme === 'dark' ? dark : light);

const WashContext = createContext<Partial<Cosmos> | null>(null);

export function useCosmos(): Cosmos {
  const base = cosmosFor(useTokens().scheme);
  const wash = useContext(WashContext);
  return useMemo(() => (wash ? { ...base, ...wash } : base), [base, wash]);
}

/** True inside an active CosmosWash (a banner-lit page). */
export const useWashActive = () => useContext(WashContext) != null;

/**
 * Page lit by a colour (the event banner's nebula, see CosmosBackdrop `hue`).
 * Cards and secondary text turn translucent so they pick up the light where it
 * falls instead of sitting on it as grey slabs; the ground, primary text and
 * the silver accent stay as they are.
 */
export function CosmosWash({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { scheme } = useTokens();
  const value = useMemo<Partial<Cosmos> | null>(() => {
    if (!active) return null;
    const ink = scheme === 'dark' ? '255, 255, 255' : '0, 0, 0';
    return {
      // Light: an ink veil, not white: the ground is white wherever the hue fades,
      // so a white card there merges into the page.
      card: scheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)',
      raised: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      soft: `rgba(${ink}, 0.78)`,
      muted: `rgba(${ink}, 0.6)`,
      tint: `rgba(${ink}, 0.06)`,
    };
  }, [active, scheme]);
  return React.createElement(WashContext.Provider, { value }, children);
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

/**
 * Row i of n in a FlatList that should read as one card (cosmos grouped list):
 * the card fill on every row, rounded only at the ends.
 */
export const cardSegment = (fill: string, i: number, n: number) => ({
  backgroundColor: fill,
  paddingHorizontal: 16,
  borderTopLeftRadius: i === 0 ? cosmosCardRadius : 0,
  borderTopRightRadius: i === 0 ? cosmosCardRadius : 0,
  borderBottomLeftRadius: i === n - 1 ? cosmosCardRadius : 0,
  borderBottomRightRadius: i === n - 1 ? cosmosCardRadius : 0,
});
