import React from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import type { Tokens } from '../../theme/tokens';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * What a variant looks like, in token terms. `gradient` set → the fill is the
 * brand LinearGradient (ignores `background`).
 */
export interface ButtonColors {
  background: string;
  foreground: string;
  border?: string;
  gradient?: readonly [string, string];
}

/** `#rrggbb` + alpha (0–1) → `#rrggbbaa`. Non-hex colours pass through unchanged. */
const tint = (hex: string, alpha: number) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : hex;

/**
 * Map a variant to its colours. No outlines anywhere (borderless-cards rule):
 * weight comes from fill alone, so the hierarchy reads primary > secondary > ghost.
 *   primary   — brand gradient, the one main action on a screen
 *   secondary — elevated fill, neutral text: alternatives like "Try again"
 *   ghost     — no fill, accent text: low-emphasis actions like "Not now"
 *   danger    — soft red fill, red text: destructive actions, loud without
 *               competing with the primary button
 */
export function resolveButtonColors(variant: ButtonVariant, tokens: Tokens): ButtonColors {
  switch (variant) {
    case 'secondary':
      return { background: tokens.elevated, foreground: tokens.text };
    case 'ghost':
      return { background: 'transparent', foreground: tokens.accent };
    case 'danger':
      return { background: tint(tokens.danger, 0.14), foreground: tokens.danger };
    case 'primary':
    default:
      return { background: tokens.accent, foreground: tokens.accentFg, gradient: tokens.accentGradient };
  }
}

const SIZES: Record<ButtonSize, { minHeight: number; paddingHorizontal: number }> = {
  sm: { minHeight: 36, paddingHorizontal: spacing[4] },
  md: { minHeight: 44, paddingHorizontal: spacing[6] },
  lg: { minHeight: 52, paddingHorizontal: spacing[8] },
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  style,
}: ButtonProps) {
  const tokens = useTokens();
  const c = resolveButtonColors(variant, tokens);
  const inactive = disabled || loading;

  const inner: ViewStyle = {
    ...SIZES[size],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: borderRadius.full,
  };

  const content = loading ? (
    <ActivityIndicator color={c.foreground} />
  ) : (
    <>
      {icon}
      <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: c.foreground }}>
        {label}
      </Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        {
          borderRadius: borderRadius.full,
          overflow: 'hidden',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          backgroundColor: c.gradient ? c.gradient[0] : c.background, // Android fallback under gradient
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {c.gradient ? (
        <LinearGradient colors={c.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={inner}>
          {content}
        </LinearGradient>
      ) : (
        <View style={inner}>{content}</View>
      )}
    </Pressable>
  );
}
