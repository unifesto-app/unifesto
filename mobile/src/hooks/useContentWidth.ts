import { useWindowDimensions } from 'react-native';
import { CONTENT_MAX } from '../theme/spacing';

/**
 * Width of the content column (the window, capped at CONTENT_MAX on tablets)
 * and the empty margin either side of it. Use in place of
 * `useWindowDimensions().width` for anything sized to fit the content, and
 * `inset` as left/right for absolutely positioned bars.
 */
export default function useContentWidth() {
  const { width: window } = useWindowDimensions();
  const width = Math.min(window, CONTENT_MAX);
  return { width, inset: (window - width) / 2 };
}
