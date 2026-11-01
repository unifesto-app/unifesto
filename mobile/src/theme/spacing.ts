// Unifesto Spacing System
//
// Every margin/padding/gap in the app is a multiple of this scale. The whole
// layout was running a little loose, so the scale is tightened by a single
// factor below — bump SPACING_SCALE toward 1 for more breathing room, or down
// for a denser UI. Applies to both platforms.
const SPACING_SCALE = 0.85;
const sp = (n: number): number => Math.round(n * SPACING_SCALE);

export const spacing = {
  0: 0,
  0.5: sp(2),
  1: sp(4),
  2: sp(8),
  3: sp(12),
  4: sp(16),
  5: sp(20),
  6: sp(24),
  7: sp(28),
  8: sp(32),
  10: sp(40),
  12: sp(48),
  16: sp(64),
  20: sp(80),
  24: sp(96),
  32: sp(128),
};

export const borderRadius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
};

// Tablets and landscape: screen content sits in a centred column no wider than
// UIKit's readable content width, so cards, posters and lines keep phone
// proportions instead of stretching edge to edge. Backdrops stay full-bleed.
export const CONTENT_MAX = 672;
export const column = { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' } as const;
// Card grids (events, saved, spaces) may run wider and take more columns.
export const GRID_MAX = 1200;
