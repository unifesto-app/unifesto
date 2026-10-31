import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthButton from '../auth/AuthButton';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import useContentWidth from '../../hooks/useContentWidth';

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
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { inset } = useContentWidth();
  const shown = visible || !!loading || !!error;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(shown ? 0 : 160, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(shown ? 1 : 0, { duration: 180 }),
  }));

  return (
    <Animated.View
      style={[styles.bar, { left: inset, right: inset, paddingBottom: Math.max(insets.bottom, spacing[4]), pointerEvents: shown ? 'auto' : 'none' }, style]}
    >
      <LinearGradient colors={[`${c.bg}00`, c.bg]} locations={[0, 0.45]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
      <AuthButton label={label} onPress={onPress} loading={loading} disabled={disabled} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing[6], paddingTop: spacing[6] },
  error: { marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
