import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../../context/ThemeContext';
import { Button } from '../ui';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface SaveBarProps {
  /** Slides in when true (something changed, saving, or an error to show). */
  visible: boolean;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
}

/**
 * The pinned save button used by the operator forms: sits above the keyboard
 * (inside a KeyboardAvoidingView), fades the content under it, and springs in
 * only once there is something to save. Give the ScrollView ~140 + inset of
 * bottom padding so the last field can scroll clear of it.
 */
export default function SaveBar({ visible, label, onPress, loading, disabled, error }: SaveBarProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const shown = visible || !!loading || !!error;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(shown ? 0 : 160, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(shown ? 1 : 0, { duration: 180 }),
  }));

  return (
    <Animated.View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]), pointerEvents: shown ? 'auto' : 'none' }, style]}
    >
      <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} locations={[0, 0.45]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
      <Button label={label} onPress={onPress} loading={loading} disabled={disabled} size="lg" fullWidth />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing[6], paddingTop: spacing[6] },
  error: { marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
