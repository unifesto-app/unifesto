import React from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '../../theme/spacing';
import { cosmosRadius, useCosmos } from '../../theme/cosmos';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, { minHeight: number; paddingHorizontal: number }> = {
  sm: { minHeight: 36, paddingHorizontal: spacing[4] },
  md: { minHeight: 44, paddingHorizontal: spacing[5] },
  lg: { minHeight: 52, paddingHorizontal: spacing[6] },
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

/**
 * The Horizon button, same look as AuthButton (the web's .btn-primary). Never an accent colour.
 *   primary   silver fill (ink by day): the one main action on a screen
 *   secondary hairline outline: alternatives like "Try again"
 *   ghost     no fill, plain text: low-emphasis actions like "Not now"
 *   danger    hairline outline, crimson label
 */
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
  const c = useCosmos();
  const primary = variant === 'primary';
  const fg = primary ? c.primaryFg : variant === 'danger' ? c.danger : c.text;
  const outline = variant === 'secondary' ? c.outline : variant === 'danger' ? c.border : undefined;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        {
          ...SIZES[size],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          borderRadius: cosmosRadius,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          backgroundColor: primary ? c.primary : pressed && variant !== 'ghost' ? c.tint : 'transparent',
          borderWidth: outline ? 1 : 0,
          borderColor: outline,
          opacity: disabled ? 0.45 : pressed && (primary || variant === 'ghost') ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: fg }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
