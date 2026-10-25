import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Timer } from '@unifesto/unicon/react-native';
import { useNow } from '../../hooks/useHackathonSocket';
import { formatClock, secondsUntil } from '../../lib/hackathon';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

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
  const c = useCosmos();
  const now = useNow(!!until);
  const left = secondsUntil(until, now);
  if (left == null) return null;
  const done = left <= 0;
  const color = done ? c.danger : left <= 60 ? c.warn : c.text;
  return (
    <View style={[styles.wrap, { backgroundColor: c.tint }]} accessibilityRole="timer" accessibilityLabel={done ? doneLabel : `${label} ${formatClock(left)} left`}>
      <Timer size={large ? 22 : 16} color={color} weight="bold" />
      <Text style={[large ? styles.large : styles.small, { color }]}>{done ? doneLabel : formatClock(left)}</Text>
      {!done ? <Text style={[styles.label, { color: c.muted }]}>{label}</Text> : null}
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
  small: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  large: { fontSize: typography.fontSize['2xl'], fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  label: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
});
