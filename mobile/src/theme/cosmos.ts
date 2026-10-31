// Unifesto Horizon. Theme locked 29 Oct 2026; the spec is marketing/brand-2026/guidelines.html,
// the mobile rules are mobile/DESIGN.md. Night first: black ground, silver type, monochrome
// chrome. Day keeps the same roles on paper with white cards. Colour lives only inside
// cards, one accent per kind of work (mint, sky, ivory).
import React, { createContext, useContext, useMemo } from 'react';
import type { TextStyle } from 'react-native';
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
  /** Crimson (#be123c by day), lifted to read on black: 5.1:1 (#be123c itself is 3.3:1). */
  danger: '#ec2f58',
  /** Amber for counts and other text that needs attention; the light value holds 4.5:1 on cards. */
  warn: '#f59e0b',
  glow: '255, 255, 255',
  /** Faint silver wash for highlighted cards (the web's rgb(var(--glow) / 0.06)). */
  tint: 'rgba(255, 255, 255, 0.06)',
  /** Cover placeholder when an image is missing: the web's night-3 field. */
  fallback: ['#1c1c20', '#0a0a0b'] as [string, string],
  /** Done states (Checked in, Paid, Sent): mint. */
  success: '#90e4c1',
  // Card accents, inside cards only (text, figures, progress, dots, glyphs);
  // never on borders, nav, links or buttons.
  /** Live and check-in. */
  mint: '#90e4c1',
  /** Tickets, events, seats. */
  sky: '#90d5ff',
  /** Money: collected, payouts, refunds, earnings. */
  ivory: '#f7f0e0',
  /** Horizon blue: the sky's glow. Decorative light only, never text. */
  horizon: '#4d8dff',
  /** Light sources (the horizon line and its bloom): white by night, pale blue by day. */
  bloom: '255, 255, 255',
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
  /** Crimson: 5.6:1 on the paper ground, 6.3:1 on cards. */
  danger: '#be123c',
  warn: '#92400e',
  glow: '17, 17, 19',
  tint: 'rgba(0, 0, 0, 0.04)',
  fallback: ['#e4e4e7', '#f4f4f5'],
  /** Deep mint (the #90e4c1 family): 5.7:1 on cards. */
  success: '#15745a',
  // The day text shades: the night accents are ~1.3:1 on white.
  mint: '#15745a',
  sky: '#0369a1',
  ivory: '#7a5a1e',
  horizon: '#8fb4ff',
  bloom: '143, 180, 255',
  scheme: 'light',
};

/** Shade card colours (guidelines §08): s1 the accent, s2 its deep partner, s3 the base. */
export type ShadeTone = 'sky' | 'mint' | 'ivory' | 'blue';
export const SHADES: Record<'dark' | 'light', Record<ShadeTone, { s1: string; s2: string; s3: string }>> = {
  dark: {
    sky: { s1: '#90d5ff', s2: '#2f6bff', s3: '#070d1c' },
    mint: { s1: '#90e4c1', s2: '#1f7a5c', s3: '#061410' },
    ivory: { s1: '#f7f0e0', s2: '#9a7444', s3: '#140f08' },
    blue: { s1: '#8fb4ff', s2: '#0062ff', s3: '#050a1f' },
  },
  light: {
    sky: { s1: '#90d5ff', s2: '#8fb4ff', s3: '#e9f3ff' },
    mint: { s1: '#90e4c1', s2: '#b7ead3', s3: '#eef9f3' },
    ivory: { s1: '#f7f0e0', s2: '#e8d3ad', s3: '#fbf7ee' },
    blue: { s1: '#b9cfff', s2: '#8fb4ff', s3: '#eef3ff' },
  },
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

/** Families registered in app/_layout.tsx. */
export const cosmosFont = {
  /** Headlines: DM Sans Medium. Titles of 24pt and up add `displayTracking(size)`. */
  display: { fontFamily: 'DMSans-Medium', letterSpacing: -0.3 },
  body: { fontFamily: 'HankenGrotesk' },
  strong: { fontFamily: 'HankenGrotesk-SemiBold' },
  /**
   * Counts, prices, dates, codes. DM Sans SemiBold, because Hanken has no ₹
   * glyph (prices set in it borrowed the system font's).
   */
  figure: { fontFamily: 'DMSans-SemiBold', fontVariant: ['tabular-nums', 'lining-nums'] as TextStyle['fontVariant'] },
} as const;

/** Headline tracking that tightens with size, capped at -4%: the web's max(calc(0.9px - 0.062em), -0.04em). */
export const displayTracking = (size: number) => Math.round(Math.max(0.9 - 0.062 * size, -0.04 * size) * 10) / 10;

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
