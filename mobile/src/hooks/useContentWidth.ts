import { useWindowDimensions } from 'react-native';
import { CONTENT_MAX } from '../theme/spacing';

/**
 * Width of the content column (the window, capped at CONTENT_MAX on tablets)
 * and the empty margin either side of it. Use in place of
 * `useWindowDimensions().width` for anything sized to fit the content, and
 * `inset` as left/right for absolutely positioned bars. It follows the window,
 * so rotation, Split View, Slide Over and floating windows just re-render.
 *
 * `hero` is the widest a 4:3 hero (poster, banner) should be: at that width it
 * stays under ~60% of the window's height, so a landscape phone or a short
 * floating window still shows what comes after it.
 */
export default function useContentWidth() {
  const { width: window, height } = useWindowDimensions();
  const width = Math.min(window, CONTENT_MAX);
  return { width, inset: (window - width) / 2, hero: Math.round(height * 0.8) };
}
