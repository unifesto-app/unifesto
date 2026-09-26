import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Tokens } from '../theme/tokens';
import { FONT_BODY_SEMIBOLD } from '../theme/typography';

/** `#rrggbb` → `rgba(r,g,b,a)`. */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The one header every pushed screen shares: transparent (content scrolls up
 * beneath it) with a blurred backdrop so the title and back button stay
 * readable over banners and lists. iOS uses the native material blur; Android
 * has no cheap live blur, so it gets a near-opaque wash of the page colour.
 * Screens only set `headerShown`, `title` and any `headerRight`.
 *
 * Applied as the root Stack's `screenOptions` (see app/_layout.tsx).
 */
export function stackHeaderDefaults(tokens: Tokens) {
  const dark = tokens.scheme === 'dark';
  return {
    headerTransparent: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: 'transparent' },
    ...(Platform.OS === 'ios'
      ? { headerBlurEffect: dark ? ('systemChromeMaterialDark' as const) : ('systemChromeMaterialLight' as const) }
      : {
          headerBackground: () => (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(tokens.bg, 0.92) }]} />
          ),
        }),
    headerTintColor: tokens.text,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerTitleAlign: 'center' as const,
    headerTitleStyle: {
      fontFamily: FONT_BODY_SEMIBOLD,
      fontSize: 17,
      color: tokens.text,
    },
    // iOS 26+ adds its own soft edge effect under the header as content
    // scrolls; the material blur above replaces it.
    scrollEdgeEffects: { top: 'hidden' as const },
    contentStyle: { backgroundColor: tokens.bg },
  };
}
