import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Timer } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { useNow } from '../../hooks/useHackathonSocket';
import { formatClock, secondsUntil } from '../../lib/hackathon';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface SlotTimerProps {
  /** When the time runs out (server time). */
  until: string | null;
  /** Shown before the clock, e.g. "Slot" or "Grace". */
  label: string;
  /** Shown instead of the clock once time is up. */
  doneLabel: string;
  /** Large clock for the judge's current slot. */
  large?: boolean;
}

/**
 * A ticking countdown to a server timestamp (slot end, grace end, the 5-minute
 * lock). Turns amber in the last minute and red once time is up.
 */
export default function SlotTimer({ until, label, doneLabel, large }: SlotTimerProps) {
  const tokens = useTokens();
  const now = useNow(!!until);
  const left = secondsUntil(until, now);
  if (left == null) return null;
  const done = left <= 0;
  const color = done ? tokens.danger : left <= 60 ? tokens.warning : tokens.text;
  return (
    <View style={[styles.wrap, { backgroundColor: tokens.fill }]} accessibilityRole="timer" accessibilityLabel={done ? doneLabel : `${label} ${formatClock(left)} left`}>
      <Timer size={large ? 22 : 16} color={color} weight="bold" />
      <Text style={[large ? styles.large : styles.small, { color }]}>{done ? doneLabel : formatClock(left)}</Text>
      {!done ? <Text style={[styles.label, { color: tokens.textMuted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  small: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...font('semibold') },
  large: { fontSize: typography.fontSize['2xl'], fontVariant: ['tabular-nums'], ...font('bold') },
  label: { fontSize: typography.fontSize.xs, ...font('medium') },
});
