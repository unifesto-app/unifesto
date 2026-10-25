import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos, type Cosmos } from '../../theme/cosmos';

// Type ramp, cosmos: Michroma for display and titles, Hanken Grotesk for the rest.
const VARIANTS = {
  display: { fontSize: typography.fontSize['4xl'], lineHeight: 1.1, ...cosmosFont.display },
  title: { fontSize: typography.fontSize['2xl'], lineHeight: 1.2, ...cosmosFont.display },
  heading: { fontSize: typography.fontSize.xl, lineHeight: 1.25, ...cosmosFont.strong },
  body: { fontSize: typography.fontSize.base, lineHeight: 1.5, ...cosmosFont.body },
  bodyStrong: { fontSize: typography.fontSize.base, lineHeight: 1.5, ...cosmosFont.strong },
  label: { fontSize: typography.fontSize.sm, lineHeight: 1.4, ...cosmosFont.strong },
  caption: { fontSize: typography.fontSize.xs, lineHeight: 1.4, ...cosmosFont.body },
} satisfies Record<string, TextStyle & { lineHeight: number }>;

const TONES = {
  default: 'text',
  secondary: 'soft',
  muted: 'muted',
  accent: 'primary',
  success: 'success',
  warning: 'warn',
  danger: 'danger',
} as const satisfies Record<string, keyof Cosmos>;

export type TextVariant = keyof typeof VARIANTS;
export type TextTone = keyof typeof TONES;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  const c = useCosmos();
  const { lineHeight, ...v } = VARIANTS[variant];
  return (
    <RNText
      {...rest}
      style={[
        v,
        // lineHeight is a multiplier in the ramp; RN wants absolute points.
        { lineHeight: Math.round(v.fontSize * lineHeight), color: c[TONES[tone]] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
