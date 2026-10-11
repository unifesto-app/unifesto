import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { CaretLeft, Timer, X } from '@unifesto/unicon/react-native';
import PressableScale from '../ui/PressableScale';
import { STEPS, type StepType } from '../../hooks/useEventRegistration';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

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
 * countdown on the right, then one labelled segment per step, so the whole
 * route (and where you are on it) is visible at a glance. The step's own
 * heading lives in the body, so the header never repeats it.
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
  const c = useCosmos();
  const index = step ? steps.findIndex((s) => s.id === step) : -1;
  const urgent = secondsLeft != null && secondsLeft <= 120;

  return (
    <SheetTop style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.bar}>
        <PressableScale
          feedback="inline"
          onPress={onBack ?? onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={onBack ? 'Previous step' : 'Close'}
          style={styles.side}
        >
          {onBack ? <CaretLeft size={24} color={c.text} weight="bold" /> : <X size={24} color={c.text} weight="bold" />}
        </PressableScale>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
        <View style={[styles.side, styles.right]}>
          {secondsLeft != null ? (
            <View
              style={styles.timer}
              accessible
              accessibilityLabel={`Seat held for ${Math.ceil(secondsLeft / 60)} more minute${secondsLeft > 60 ? 's' : ''}`}
            >
              <Timer size={16} color={urgent ? c.danger : c.muted} weight="bold" />
              <Text style={[styles.timerText, { color: urgent ? c.danger : c.soft }]}>{mmss(secondsLeft)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {index >= 0 ? (
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${index + 1} of ${steps.length}, ${steps[index].label}`}
        >
          {steps.map((s, i) => (
            <View key={s.id} style={styles.stepCol}>
              <Segment filled={i <= index} color={c.primary} track={c.border} />
              <Text style={[styles.stepText, { color: i === index ? c.text : c.muted }, i === index && cosmosFont.strong]} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </SheetTop>
  );
}

function Segment({ filled, color, track }: { filled: boolean; color: string; track: string }) {
  // withTiming follows the system Reduce Motion setting (jumps straight to the end).
  const fill = useAnimatedStyle(() => ({ width: withTiming(filled ? '100%' : '0%', { duration: 260 }) }));
  return (
    <View style={[styles.segment, { backgroundColor: track }]}>
      <Animated.View style={[styles.segmentFill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  side: { width: 76, height: 44, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, ...cosmosFont.strong },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  progress: { flexDirection: 'row', gap: 6, marginTop: spacing[3], paddingBottom: spacing[3] },
  stepCol: { flex: 1, gap: spacing[2] },
  segment: { height: 4, borderRadius: 2, overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 2 },
  stepText: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
