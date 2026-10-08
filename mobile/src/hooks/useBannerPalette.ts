import { useEffect, useState } from 'react';
import ImageColors from 'react-native-image-colors';
import { getEventPalette } from '../lib/api/events';
import { getSpacePalette } from '../lib/api/spaces';
import { useTheme } from '../context/ThemeContext';

type Rgb = [number, number, number];

/** Whose banner it is, so the backend can rank its colours. */
export type PaletteSource = { event: string } | { space: string };

const toRgb = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = ([r, g, b]: Rgb) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

type Hsl = [number, number, number]; // h 0–360, s 0–1, l 0–1

const rgbToHsl = ([r, g, b]: Rgb): Hsl => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60 : max === gn ? ((bn - rn) / d + 2) * 60 : ((rn - gn) / d + 4) * 60;
  return [h, s, l];
};

const hslToRgb = ([h, s, l]: Hsl): Rgb => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

/**
 * "No colour": near-white (every channel ≥ 225: paper, snow, blown-out sky),
 * near-black (every channel ≤ 35: ink, night, letterbox bars) or grey (channels
 * within 25 of each other: concrete, slate, silver). The gradient skips these
 * for the next most frequent colour.
 */
const isNeutral = (hex: string) => {
  const rgb = toRgb(hex);
  if (!rgb) return true;
  const hi = Math.max(...rgb);
  const lo = Math.min(...rgb);
  return lo >= 225 || hi <= 35 || hi - lo < 25;
};

/** Dominant colour per banner URL, shared across screens for the session. */
const cache = new Map<string, string>();

/**
 * Primary: the backend ranks the banner's colours by pixel share; we take the
 * most frequent one that isn't white, black or grey.
 * Fallback, e.g. before the backend is deployed: the on-device picker's
 * "most common" colour (background on iOS, dominant on Android).
 */
async function extract(source: PaletteSource | null, uri: string): Promise<string | null> {
  const hit = cache.get(uri);
  if (hit) return hit;
  const fetchRanked = !source ? null : 'event' in source ? getEventPalette(source.event) : getSpacePalette(source.space);
  const ranked = fetchRanked ? (await fetchRanked.catch(() => [])).map((c) => c.hex) : [];
  let top = ranked.find((c) => !isNeutral(c));
  if (!top && ranked.length === 0) {
    const res = await ImageColors.getColors(uri, { cache: true, key: uri, quality: 'low', fallback: '#000000' });
    const picked =
      res.platform === 'ios'
        ? [res.background, res.primary, res.secondary, res.detail]
        : res.platform === 'android' || res.platform === 'web'
          ? [res.dominant, res.vibrant, res.darkVibrant, res.muted]
          : [];
    top = picked.find((c): c is string => !!c && !isNeutral(c));
  }
  // Only white/black/grey in the banner → no wash; the page stays on the plain theme bg.
  if (!top) return null;
  cache.set(uri, top);
  return top;
}

/** The banner's most frequent (non-neutral) colour, raw. Null until extracted. */
function useBannerTop(uri?: string | null, source?: PaletteSource | null): string | null {
  const [top, setTop] = useState<string | null>(() => (uri ? cache.get(uri) ?? null : null));
  // Callers pass a fresh object each render; key the effect on its contents.
  const sourceKey = !source ? '' : 'event' in source ? `event:${source.event}` : `space:${source.space}`;

  useEffect(() => {
    if (!uri) {
      setTop(null);
      return;
    }
    let alive = true;
    extract(source ?? null, uri)
      .then((c) => alive && setTop(c))
      .catch(() => alive && setTop(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `source` is captured via sourceKey
  }, [sourceKey, uri]);

  return top;
}

/**
 * The banner's colour as an element tint (text, icons, dots) on the plain
 * theme background: same hue, lightness pushed far enough from the bg to read.
 */
export function useBannerAccent(uri?: string | null, source?: PaletteSource | null): string | null {
  const { isDark } = useTheme();
  const color = toRgb(useBannerTop(uri, source) ?? '');
  if (!color) return null;
  const [h, sat, l] = rgbToHsl(color);
  return toHex(hslToRgb([h, Math.max(sat, 0.5), isDark ? Math.max(l, 0.62) : Math.min(l, 0.42)]));
}
