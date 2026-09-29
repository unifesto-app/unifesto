import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { Tokens } from '../theme/tokens';
import { FONT_BODY_SEMIBOLD } from '../theme/typography';

/** `#rrggbb` → `rgba(r,g,b,a)`. */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The header's backdrop, drawn by us rather than through the nav bar's own
 * appearance so it looks the same on every screen and OS version:
 *
 * - iOS: a real material blur (UIVisualEffectView via expo-blur). The nav
 *   bar's `headerBlurEffect` only read as a faint tint until content happened
 *   to scroll under it, and iOS 26's bars don't reliably apply it.
 * - Android: can't live-blur behind the native header (expo-blur needs the
 *   blurred content wrapped in its target view), so a translucent raised tint.
 *   The old wash was the page colour itself, which made the header invisible.
 *
 * A hairline marks the bottom edge on both, so the bar reads as a bar even on
 * screens where nothing scrolls beneath it.
 */
function HeaderBackdrop({ tokens }: { tokens: Tokens }) {
  const dark = tokens.scheme === 'dark';
  const edge = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border };
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={80}
        tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[StyleSheet.absoluteFill, edge]}
      />
    );
  }
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        edge,
        { backgroundColor: withAlpha(dark ? tokens.surface : tokens.elevated, 0.94) },
      ]}
    />
  );
}

/**
 * The one header every pushed screen shares: transparent (content scrolls up
 * beneath it) over a blurred backdrop (see HeaderBackdrop) so the title and
 * back button stay readable over banners and lists. Screens only set
 * `headerShown`, `title` and any `headerRight`.
 *
 * Applied as the root Stack's `screenOptions` (see app/_layout.tsx).
 */
export function stackHeaderDefaults(tokens: Tokens) {
  return {
    headerTransparent: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: 'transparent' },
    headerBackground: () => <HeaderBackdrop tokens={tokens} />,
    headerTintColor: tokens.text,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerTitleAlign: 'center' as const,
    headerTitleStyle: {
      fontFamily: FONT_BODY_SEMIBOLD,
      fontSize: 17,
      color: tokens.text,
    },
    // iOS 26+ adds its own soft edge effect under the header as content
    // scrolls; the backdrop above replaces it.
    scrollEdgeEffects: { top: 'hidden' as const },
    contentStyle: { backgroundColor: tokens.bg },
  };
}
