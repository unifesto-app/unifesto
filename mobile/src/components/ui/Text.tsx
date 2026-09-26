import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import type { Tokens } from '../../theme/tokens';

// Type ramp. Headings (Plus Jakarta Sans) are only used at 18px+, per
// typography.ts; everything smaller is DM Sans.
const VARIANTS = {
  display: { fontSize: typography.fontSize['4xl'], lineHeight: 1.1, ...font('heading') },
  title: { fontSize: typography.fontSize['2xl'], lineHeight: 1.2, ...font('heading') },
  heading: { fontSize: typography.fontSize.xl, lineHeight: 1.25, ...font('heading') },
  body: { fontSize: typography.fontSize.base, lineHeight: 1.5, ...font() },
  bodyStrong: { fontSize: typography.fontSize.base, lineHeight: 1.5, ...font('semibold') },
  label: { fontSize: typography.fontSize.sm, lineHeight: 1.4, ...font('medium') },
  caption: { fontSize: typography.fontSize.xs, lineHeight: 1.4, ...font() },
} satisfies Record<string, TextStyle & { lineHeight: number }>;

const TONES = {
  default: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const satisfies Record<string, keyof Tokens>;

export type TextVariant = keyof typeof VARIANTS;
export type TextTone = keyof typeof TONES;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  const tokens = useTokens();
  const { lineHeight, ...v } = VARIANTS[variant];
  return (
    <RNText
      {...rest}
      style={[
        v,
        // lineHeight is a multiplier in the ramp; RN wants absolute points.
        { lineHeight: Math.round(v.fontSize * lineHeight), color: tokens[TONES[tone]] as string },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
