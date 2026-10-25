import React from 'react';
import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { borderRadius, spacing } from '../../theme/spacing';
import { useCosmos } from '../../theme/cosmos';

export interface CardProps extends ViewProps {
  /** `surface` = default card; `elevated` = sits on top of another card. */
  tone?: 'surface' | 'elevated';
  padded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({ tone = 'surface', padded = true, onPress, style, children, ...rest }: CardProps) {
  const c = useCosmos();
  const base: ViewStyle = {
    // Borderless: the fill lifts the card off the ground.
    backgroundColor: tone === 'surface' ? c.raised : c.tint,
    borderRadius: borderRadius.lg,
    padding: padded ? spacing[4] : 0,
    overflow: 'hidden',
  };

  if (onPress) {
    return (
      <Pressable
        {...rest}
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View {...rest} style={[base, style]}>
      {children}
    </View>
  );
}
