import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER } from '../components/home/Section';
import { GRID_MAX } from '../theme/spacing';

/**
 * A card grid that follows the window: as many columns of at least `minItem`
 * as fit, never fewer than `minColumns`. Rotation, Split View, Slide Over and
 * floating windows just re-render it. `maxWidth` caps the list's content
 * container (GRID_MAX, and clear of a landscape notch); inside its GUTTER
 * padding each card is `itemWidth` wide with `gap` between.
 */
export default function useGrid(minItem: number, gap: number, minColumns = 1) {
  const { width: window } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxWidth = Math.min(GRID_MAX, window - 2 * Math.max(insets.left, insets.right));
  const inner = maxWidth - GUTTER * 2;
  const columns = Math.max(minColumns, Math.floor((inner + gap) / (minItem + gap)));
  return { maxWidth, columns, itemWidth: Math.floor((inner - gap * (columns - 1)) / columns) };
}

/** Splits a list into rows of `size` for a FlatList, which keeps its scroll on resize (numColumns can't change live). */
export function rows<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
