import type { Tokens } from '../theme/tokens';
import { FONT_BODY_SEMIBOLD } from '../theme/typography';

/**
 * The one header every pushed screen shares: fully transparent — no fill,
 * blur, fade or hairline — so the title and back button sit directly on the
 * screen. Screens only set `headerShown`, `title` and any `headerRight`.
 *
 * Applied as the root Stack's `screenOptions` (see app/_layout.tsx).
 */
export function stackHeaderDefaults(tokens: Tokens) {
  return {
    headerTransparent: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: 'transparent' },
    headerTintColor: tokens.text,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerTitleAlign: 'center' as const,
    headerTitleStyle: {
      fontFamily: FONT_BODY_SEMIBOLD,
      fontSize: 17,
      color: tokens.text,
    },
    // iOS 26+ otherwise adds its own soft blur under the header as content
    // scrolls beneath it — the semi-transparent band we don't want.
    scrollEdgeEffects: { top: 'hidden' as const },
    contentStyle: { backgroundColor: tokens.bg },
  };
}
