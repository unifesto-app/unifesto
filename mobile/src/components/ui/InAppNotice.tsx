import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRinging } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { Text } from './Text';
import { CardBackdrop, CardSurfaceProvider } from './CardSurface';

const SHOW_MS = 6_000;

export interface Notice {
  title: string;
  body?: string;
  /** Called when the notice is tapped (usually: open its deep link). */
  onPress?: () => void;
}

let show: ((n: Notice) => void) | null = null;

/**
 * Show a push that arrived while the app is open as an in-app card instead of
 * the system banner. Needs <InAppNoticeHost /> mounted once at the root; a
 * newer notice replaces the one on screen.
 */
export function showInAppNotice(n: Notice): boolean {
  if (!show) return false;
  show(n);
  return true;
}

/** Floating glass card at the top; slides in, taps through, then slides away. */
export function InAppNoticeHost() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<(Notice & { key: number }) | null>(null);

  useEffect(() => {
    let key = 0;
    show = (n) => setNotice({ ...n, key: ++key });
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Animated.View
        key={notice.key}
        // Slides, never fades: opacity < 1 on the card breaks Liquid Glass.
        entering={SlideInUp.duration(220)}
        exiting={SlideOutUp.duration(180)}
        style={styles.card}
      >
        <CardSurfaceProvider kind="glass">
          <CardBackdrop shape={styles.card} opaque />
        </CardSurfaceProvider>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${notice.title}. ${notice.body ?? ''}`}
          onPress={() => {
            setNotice(null);
            notice.onPress?.();
          }}
        >
          <BellRinging size={22} color={tokens.accent} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1} style={{ color: tokens.text }}>
              {notice.title}
            </Text>
            {notice.body ? (
              <Text variant="caption" numberOfLines={2} style={{ color: tokens.textSecondary }}>
                {notice.body}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1001,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
});
