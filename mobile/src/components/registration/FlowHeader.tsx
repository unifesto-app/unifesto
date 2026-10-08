import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { CaretLeft, Timer, X } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { STEPS, type StepType } from '../../hooks/useEventRegistration';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export const GUTTER = spacing[6];

/**
 * Top of the registration modals. SafeAreaView measures where the view really
 * is, so it clears the status bar when the modal is full screen and adds
 * nothing extra when it's an iOS sheet that already starts below it.
 */
export function SheetTop({ children, style, fill }: { children?: React.ReactNode; style?: object; fill?: boolean }) {
  return (
    <SafeAreaView edges={['top']} style={[fill && { flex: 1 }, style]}>
      <View style={[{ paddingTop: spacing[2] }, fill && { flex: 1 }]}>{children}</View>
    </SafeAreaView>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Registration header: back/close on the left, the event title, the seat-hold
 * countdown on the right, then a progress bar (one part per step) with the step name.
 */
export function FlowHeader({
  title,
  step,
  steps = STEPS,
  secondsLeft,
  onBack,
  onClose,
}: {
  title: string;
  step: StepType | null;
  /** Visible steps; Details drops out when there's nothing to fill in. */
  steps?: typeof STEPS;
  secondsLeft: number | null;
  onBack: (() => void) | null;
  onClose: () => void;
}) {
  const tokens = useTokens();
  const index = step ? steps.findIndex((s) => s.id === step) : -1;
  const urgent = secondsLeft != null && secondsLeft <= 120;

  return (
    <SheetTop style={{ paddingHorizontal: GUTTER, backgroundColor: tokens.bg }}>
      <View style={styles.bar}>
        <Pressable
          onPress={onBack ?? onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={onBack ? 'Previous step' : 'Close'}
          style={({ pressed }) => [styles.side, { opacity: pressed ? 0.6 : 1 }]}
        >
          {onBack ? <CaretLeft size={24} color={tokens.text} weight="bold" /> : <X size={24} color={tokens.text} weight="bold" />}
        </Pressable>
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>{title}</Text>
        <View style={[styles.side, styles.right]}>
          {secondsLeft != null ? (
            <View style={styles.timer} accessibilityLabel={`${mmss(secondsLeft)} left to finish`}>
              <Timer size={16} color={urgent ? tokens.danger : tokens.textMuted} weight="bold" />
              <Text style={[styles.timerText, { color: urgent ? tokens.danger : tokens.textSecondary }]}>{mmss(secondsLeft)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {index >= 0 ? (
        <View style={styles.progressWrap}>
          <View style={styles.progress}>
            {steps.map((s, i) => (
              <Segment key={s.id} filled={i <= index} color={tokens.accent} track={tokens.elevated} />
            ))}
          </View>
          <Text style={[styles.stepText, { color: tokens.textMuted }]}>
            Step {index + 1} of {steps.length} · <Text style={{ color: tokens.text }}>{STEP_TITLES[steps[index].id]}</Text>
          </Text>
        </View>
      ) : null}
    </SheetTop>
  );
}

const STEP_TITLES: Record<StepType, string> = {
  ticket: 'Choose a ticket',
  details: 'Who is going',
  review: 'Check everything',
  payment: 'Confirm and pay',
};

function Segment({ filled, color, track }: { filled: boolean; color: string; track: string }) {
  const fill = useAnimatedStyle(() => ({ width: withTiming(filled ? '100%' : '0%', { duration: 260 }) }));
  return (
    <View style={[styles.segment, { backgroundColor: track }]}>
      <Animated.View style={[styles.segmentFill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  side: { width: 72, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, ...font('semibold') },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...font('semibold') },
  progressWrap: { marginTop: spacing[3], paddingBottom: spacing[3] },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 2 },
  stepText: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('medium') },
});
