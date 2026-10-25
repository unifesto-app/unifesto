import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, WarningCircle, WifiSlash } from '@unifesto/unicon/react-native';
import { useNetworkNotice } from '../../lib/offline/connectivity';
import { Text } from './Text';
import { CardBackdrop, CardSurfaceProvider } from './CardSurface';
import { useCosmos } from '../../theme/cosmos';

const BACK_ONLINE_MS = 2_000;

/**
 * Floating status pill mounted once at the root, the one network notice for
 * every screen. Shows while offline or while the server is failing and screens
 * are showing their last good copy, then briefly confirms when the connection
 * returns. Never blocks touches — the app stays usable underneath.
 */
export function OfflineBanner() {
  const notice = useNetworkNotice();
  const offline = notice === 'offline';
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      setBackOnline(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBackOnline(true);
    const t = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    return () => clearTimeout(t);
  }, [offline]);

  if (!notice && !backOnline) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Animated.View
        key={notice ?? 'online'}
        // Slides, never fades: opacity < 1 on the pill breaks Liquid Glass.
        entering={SlideInUp.duration(220)}
        exiting={SlideOutUp.duration(180)}
        style={styles.pill}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {/* Floats over any screen, so always glass, with a solid base on Android. */}
        <CardSurfaceProvider kind="glass">
          <CardBackdrop shape={styles.pill} opaque />
        </CardSurfaceProvider>
        {offline ? (
          <WifiSlash size={18} color={c.warn} weight="bold" />
        ) : notice === 'saved' ? (
          <WarningCircle size={18} color={c.warn} weight="fill" />
        ) : (
          <CheckCircle size={18} color={c.success} weight="fill" />
        )}
        <Text variant="label">
          {offline
            ? "You're offline · showing saved info"
            : notice === 'saved'
              ? "Couldn't refresh · showing saved info"
              : 'Back online'}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
