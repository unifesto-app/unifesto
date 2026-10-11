import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { borderRadius } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Pulsing placeholder block. Runs on Reanimated (UI thread): the old
 * core-Animated native-driver loop flooded the log with "Sending
 * `onAnimatedValueUpdate` with no listeners registered" on the New
 * Architecture, once per frame per skeleton.
 */
export default function Skeleton({
  width = '100%',
  height = 20,
  borderRadius: customBorderRadius = borderRadius.md,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  // Reduce Motion: hold mid-pulse instead of breathing.
  const pulse = useSharedValue(reduced ? 0.5 : 0);

  useEffect(() => {
    if (reduced) return;
    // 0 → 1 → 0 … forever (reverse = true), 1s each way.
    pulse.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.3 + pulse.value * 0.4 }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.borderMuted,
          overflow: 'hidden',
          width: width as any,
          height: typeof height === 'number' ? height : undefined,
          borderRadius: customBorderRadius,
        },
        animated,
        style,
      ]}
    />
  );
}
