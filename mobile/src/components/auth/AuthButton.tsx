import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowRight } from '@unifesto/unicon/react-native';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

interface AuthButtonProps {
  label: string;
  onPress: () => void;
  /** primary = silver fill (the web's .btn-primary); secondary = hairline outline. */
  variant?: 'primary' | 'secondary';
  /** Leading mark, e.g. a provider logo. */
  icon?: React.ReactNode;
  /** Trailing arrow, as on the web's primary CTAs. */
  arrow?: boolean;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export default function AuthButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  arrow = false,
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
}: AuthButtonProps) {
  const c = useCosmos();
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? c.primaryFg : c.text;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        isPrimary
          ? { backgroundColor: c.primary }
          : { borderWidth: 1, borderColor: c.outline, backgroundColor: pressed ? c.border : 'transparent' },
        { opacity: disabled ? 0.45 : pressed && isPrimary ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, { color: fg, opacity: 1 }]}>{label}</Text>
          {arrow && <ArrowRight size={16} color={fg} weight="bold" />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: cosmosRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  label: { fontSize: 16, ...cosmosFont.strong },
});
