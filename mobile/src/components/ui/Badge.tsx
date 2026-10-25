import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { borderRadius, spacing } from '../../theme/spacing';
import { Text } from './Text';
import { useCosmos } from '../../theme/cosmos';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

/** Small status pill: tinted background + solid-colour text of the same hue. */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const c = useCosmos();
  const fg = { neutral: c.soft, accent: c.primary, success: c.success, warning: c.warn, danger: c.danger }[tone];
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: spacing[2],
          paddingVertical: spacing[0.5],
          borderRadius: borderRadius.full,
          // 8-digit hex = colour at ~15% alpha; neutral uses the border tint.
          backgroundColor: tone === 'neutral' ? c.border : `${fg}26`,
        },
        style,
      ]}
    >
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
