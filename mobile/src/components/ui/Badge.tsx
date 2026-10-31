import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Check } from '@unifesto/unicon/react-native';
import { spacing } from '../../theme/spacing';
import { Text } from './Text';
import { useCosmos } from '../../theme/cosmos';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'sky' | 'ivory';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

/**
 * A status written as plain text, never a pill (Horizon: "✓ Checked in").
 * Done states get a tick; the rest are coloured or muted text.
 */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const c = useCosmos();
  const fg = {
    neutral: c.muted,
    accent: c.text,
    success: c.success,
    warning: c.warn,
    danger: c.danger,
    sky: c.sky,
    ivory: c.ivory,
  }[tone];
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing[1], alignSelf: 'flex-start' }, style]}>
      {tone === 'success' ? <Check size={13} color={fg} weight="bold" /> : null}
      <Text variant="label" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
