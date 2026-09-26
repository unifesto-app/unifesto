import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows, borderRadius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { getFontFamily } from '../theme/fontHelpers';

interface GradientButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function GradientButton({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: GradientButtonProps) {
  const { colors } = useTheme();
  const sizeStyles = {
    sm: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13 },
    md: { paddingHorizontal: 24, paddingVertical: 12, fontSize: 15 },
    lg: { paddingHorizontal: 32, paddingVertical: 16, fontSize: 17 },
  };

  const currentSize = sizeStyles[size];

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          styles.button,
          {
            paddingHorizontal: currentSize.paddingHorizontal,
            paddingVertical: currentSize.paddingVertical,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: 'transparent',
          },
          disabled && styles.disabled,
          style,
        ]}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text
            style={[
              styles.text,
              { fontSize: currentSize.fontSize, color: colors.primary },
              textStyle,
            ]}
          >
            {children}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.buttonContainer, disabled && styles.disabled, style]}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            paddingHorizontal: currentSize.paddingHorizontal,
            paddingVertical: currentSize.paddingVertical,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text
            style={[
              styles.text,
              { fontSize: currentSize.fontSize, color: '#000000' },
              textStyle,
            ]}
          >
            {children}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    ...shadows.md,
  },
  button: {
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  text: {
    fontFamily: getFontFamily('600'),
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
