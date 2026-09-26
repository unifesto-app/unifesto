import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { CheckCircle, ClockCounterClockwise, XCircle } from 'phosphor-react-native';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export type ScanFeedback = {
  kind: 'success' | 'already' | 'error';
  title: string;
  name?: string;
  detail?: string;
};

// Fixed colours: this card sits on the camera, which stays dark in both themes.
const TONE = {
  success: { fg: '#10b981', Icon: CheckCircle },
  already: { fg: '#f59e0b', Icon: ClockCounterClockwise },
  error: { fg: '#ef4444', Icon: XCircle },
} as const;

/**
 * The scan verdict, slid up over the bottom of the camera. The attendee's
 * name is the largest text: that's what door staff read out loud.
 */
export default function ScanResultCard({ feedback, onDismiss }: { feedback: ScanFeedback; onDismiss: () => void }) {
  const { fg, Icon } = TONE[feedback.kind];
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(180)}>
      <Pressable onPress={onDismiss} accessibilityRole="alert" style={styles.card}>
        <Icon size={40} color={fg} weight="fill" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: fg }]}>{feedback.title}</Text>
          {feedback.name ? (
            <Text style={styles.name} numberOfLines={1}>
              {feedback.name}
            </Text>
          ) : null}
          {feedback.detail ? (
            <Text style={styles.detail} numberOfLines={2}>
              {feedback.detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[5],
    borderRadius: borderRadius['2xl'],
    backgroundColor: 'rgba(20, 20, 20, 0.94)',
  },
  title: { fontSize: typography.fontSize.sm, ...font('semibold') },
  name: { fontSize: typography.fontSize.xl, color: '#ffffff', ...font('heading') },
  detail: { fontSize: typography.fontSize.sm, color: 'rgba(255, 255, 255, 0.65)', ...font() },
});
