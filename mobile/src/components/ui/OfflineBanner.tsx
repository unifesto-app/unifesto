import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, WifiSlash } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { useIsOffline } from '../../lib/offline/connectivity';
import { Text } from './Text';

const BACK_ONLINE_MS = 2_000;

/**
 * Floating status pill mounted once at the root. Shows while offline (screens
 * are showing saved copies), then briefly confirms when the connection returns.
 * Never blocks touches — the app stays usable underneath.
 */
export function OfflineBanner() {
  const offline = useIsOffline();
  const tokens = useTokens();
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

  if (!offline && !backOnline) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Animated.View
        key={offline ? 'offline' : 'online'}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(180)}
        style={[styles.pill, { backgroundColor: tokens.elevated }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {offline ? (
          <WifiSlash size={18} color={tokens.warning} weight="bold" />
        ) : (
          <CheckCircle size={18} color={tokens.success} weight="fill" />
        )}
        <Text variant="label">{offline ? "You're offline · showing saved info" : 'Back online'}</Text>
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
