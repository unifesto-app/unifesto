import { useWindowDimensions } from 'react-native';
import { CONTENT_MAX } from '../theme/spacing';

/**
 * Width of the content column (the window, capped at CONTENT_MAX on tablets).
 * Use in place of `useWindowDimensions().width` for anything sized to fit the
 * content. It follows the window, so rotation, Split View, Slide Over and
 * floating windows just re-render. Absolutely positioned bars and sheets take
 * the `column` style instead: it centres them in whatever holds them, which on
 * iPad may be a page sheet narrower than the window.
 *
 * `hero` is the widest a 4:3 hero (poster, banner) should be: at that width it
 * stays under ~60% of the window's height, so a landscape phone or a short
 * floating window still shows what comes after it.
 */
export default function useContentWidth() {
  const { width: window, height } = useWindowDimensions();
  return { width: Math.min(window, CONTENT_MAX), hero: Math.round(height * 0.8) };
}
