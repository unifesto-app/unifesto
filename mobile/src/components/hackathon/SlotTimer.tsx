import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Timer } from '@unifesto/unicon/react-native';
import { useNow } from '../../hooks/useHackathonSocket';
import { formatClock, secondsUntil } from '../../lib/hackathon';
import { spacing } from '../../theme/spacing';
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
 * lock). Plain glyph and figure, no pill. Turns amber in the last minute and
 * red once time is up.
 */
export default function SlotTimer({ until, label, doneLabel, large }: SlotTimerProps) {
  const c = useCosmos();
  const now = useNow(!!until);
  const left = secondsUntil(until, now);
  if (left == null) return null;
  const done = left <= 0;
  const color = done ? c.danger : left <= 60 ? c.warn : c.text;
  return (
    <View style={styles.wrap} accessibilityRole="timer" accessibilityLabel={done ? doneLabel : `${label} ${formatClock(left)} left`}>
      <Timer size={large ? 26 : 16} color={color} weight="bold" />
      <Text style={[large ? styles.large : styles.small, { color }]}>{done ? doneLabel : formatClock(left)}</Text>
      {!done && label ? <Text style={[styles.label, { color: c.muted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing[2] },
  small: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  large: { fontSize: 32, lineHeight: 38, ...cosmosFont.figure },
  label: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
});
