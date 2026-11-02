import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CaretRight } from '@unifesto/unicon/react-native';
import { successTap } from '../../lib/haptics';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

const KNOB = 44;
const PAD = 4;

// A slide in progress. The screen ignores a back gesture that fires under it (Android's edge back).
let dragging = false;
export const isSliding = () => dragging;

/**
 * Slide the knob to the end to pay, so a stray tap never spends money. Let go
 * early and it springs back; after paying it's back home at once (the bar
 * shows the spinner while `loading`). Screen readers get a plain button: double-tap
 * pays, since a drag is no way to pay with VoiceOver or TalkBack.
 */
export default function SlideToPay({ label, onComplete, disabled = false, loading = false, style }: {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useCosmos();
  const x = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const max = Math.max(width - KNOB - PAD * 2, 0);
  const blocked = disabled || loading;
  // The responder is made once; it reads the latest of these.
  const live = useRef({ max, blocked, onComplete });
  live.current = { max, blocked, onComplete };

  const pan = useMemo(() => {
    const home = () => {
      dragging = false;
      Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    };
    return PanResponder.create({
      // Claimed on first touch, ahead of anything behind it, and kept until let go.
      onStartShouldSetPanResponder: () => !live.current.blocked,
      onStartShouldSetPanResponderCapture: () => !live.current.blocked,
      onMoveShouldSetPanResponder: (_, g) => !live.current.blocked && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragging = true;
      },
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(g.dx, 0), live.current.max)),
      onPanResponderRelease: (_, g) => {
        if (live.current.max > 0 && g.dx >= live.current.max * 0.9) {
          successTap();
          // Straight home, no spring: the spinner takes the knob's place, and a spring cut
          // short there left the knob at the far end when the bar came back (a cancel).
          dragging = false;
          x.setValue(0);
          live.current.onComplete();
          return;
        }
        home();
      },
      onPanResponderTerminate: home,
    });
  }, [x]);

  const fade = x.interpolate({ inputRange: [0, Math.max(max * 0.6, 1)], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Slide right, or double-tap, to pay"
      accessibilityState={{ disabled: blocked, busy: loading }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !blocked) onComplete();
      }}
      style={[styles.track, { backgroundColor: c.primary, opacity: disabled ? 0.6 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={c.primaryFg} />
      ) : (
        <>
          <Animated.Text style={[styles.label, { color: c.primaryFg, opacity: fade }]} numberOfLines={1}>
            {label}
          </Animated.Text>
          <Animated.View {...pan.panHandlers} style={[styles.knob, { backgroundColor: c.primaryFg, transform: [{ translateX: x }] }]}>
            <CaretRight size={22} color={c.primary} weight="bold" />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: KNOB + PAD * 2,
    borderRadius: cosmosRadius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: KNOB + PAD * 2,
    paddingRight: PAD * 3,
  },
  label: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  knob: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    width: KNOB,
    height: KNOB,
    borderRadius: cosmosRadius - PAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
