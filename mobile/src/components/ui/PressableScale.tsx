import React from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Critically damped (no bounce): a quick dip on touch-down, a softer settle on
// release. Springs start from wherever the value is, so a fast re-tap mid-release
// picks up from there instead of jumping. Reduce Motion skips straight to the end.
const DOWN = { duration: 120, dampingRatio: 1 };
const UP = { duration: 300, dampingRatio: 1 };

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** `card`: anything with a surface shrinks a touch. `inline`: text links and list rows dim. */
  feedback?: 'card' | 'inline';
  style?: StyleProp<ViewStyle>;
}

/** The one press response on Home, so the same kind of thing always reacts the same way. */
export default function PressableScale({ feedback = 'card', style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const p = useSharedValue(0);
  const animated = useAnimatedStyle(() =>
    feedback === 'card' ? { transform: [{ scale: 1 - 0.03 * p.value }] } : { opacity: 1 - 0.4 * p.value },
  );

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        p.value = withSpring(1, DOWN);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        p.value = withSpring(0, UP);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
