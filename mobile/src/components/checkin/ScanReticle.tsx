import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export type ReticleState = 'idle' | 'busy' | 'success' | 'already' | 'error';

const SIZE = 250;
const ARM = 44;
const STROKE = 4;
const RADIUS = 22;

// The camera overlay is dark in both themes, so these are fixed, not tokens.
const COLORS: Record<ReticleState, string> = {
  idle: '#ffffff',
  busy: '#ffffff',
  success: '#10b981',
  already: '#f59e0b',
  error: '#ef4444',
};
const ORDER: ReticleState[] = ['idle', 'busy', 'success', 'already', 'error'];

/**
 * Four corner brackets framing the QR. They breathe while a scan is in
 * flight, pop and change colour on the result (green in, amber already in,
 * red failed), then settle back to white.
 */
export default function ScanReticle({ state }: { state: ReticleState }) {
  const tone = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    tone.value = withTiming(ORDER.indexOf(state), { duration: 160 });
    cancelAnimation(scale);
    if (state === 'busy') {
      scale.value = withRepeat(withSequence(withTiming(0.94, { duration: 420 }), withTiming(1, { duration: 420 })), -1);
    } else if (state === 'idle') {
      scale.value = withSpring(1);
    } else {
      scale.value = withSequence(withTiming(1.06, { duration: 110 }), withSpring(1, { damping: 12 }));
    }
  }, [state, tone, scale]);

  const frame = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const corner = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      tone.value,
      ORDER.map((_, i) => i),
      ORDER.map((s) => COLORS[s]),
    ),
  }));

  return (
    <Animated.View style={[styles.frame, frame]} pointerEvents="none">
      <Animated.View style={[styles.corner, styles.tl, corner]} />
      <Animated.View style={[styles.corner, styles.tr, corner]} />
      <Animated.View style={[styles.corner, styles.bl, corner]} />
      <Animated.View style={[styles.corner, styles.br, corner]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { width: SIZE, height: SIZE },
  corner: { position: 'absolute', width: ARM, height: ARM, borderColor: '#fff' },
  tl: { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: RADIUS },
  tr: { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: RADIUS },
  bl: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: RADIUS },
  br: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: RADIUS },
});
