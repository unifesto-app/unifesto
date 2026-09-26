import React, { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import type { StatusDay } from '../../lib/api/apex';
import type { Tokens } from '../../theme/tokens';

/** Colour for one day's bar. */
export function dayTone(day: StatusDay, tokens: Tokens): string {
  if (day.status === 'nodata' || day.uptime == null) return tokens.fillStrong;
  if (day.status === 'up') return tokens.success;
  if (day.status === 'down') return tokens.danger;
  // Partial day: a blip is amber, losing more than an hour or so is red.
  return day.uptime >= 95 ? tokens.warning : tokens.danger;
}

interface Props {
  days: StatusDay[];
  /** Index of the scrubbed day, or null. */
  selected: number | null;
  onSelect: (index: number | null) => void;
}

/**
 * Status-page style strip, one bar per day (oldest → today). Bars are a few
 * points wide on a phone, too thin to tap one by one, so a finger scrubs
 * across the whole strip instead; vertical scrolling can still take over.
 */
export default function UptimeBars({ days, selected, onSelect }: Props) {
  const tokens = useTokens();
  const [width, setWidth] = useState(0);
  const last = useRef<number | null>(null);

  const pick = (e: GestureResponderEvent) => {
    if (!width || days.length === 0) return;
    const i = Math.min(days.length - 1, Math.max(0, Math.floor((e.nativeEvent.locationX / width) * days.length)));
    if (i !== last.current) {
      last.current = i;
      onSelect(i);
    }
  };

  return (
    <View
      style={styles.strip}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={pick}
      onResponderMove={pick}
      onResponderTerminationRequest={() => true}
      accessibilityRole="adjustable"
      accessibilityLabel="Daily uptime"
    >
      {days.map((d, i) => (
        <View
          key={d.date}
          style={[
            styles.bar,
            { backgroundColor: dayTone(d, tokens) },
            selected != null && i !== selected && styles.dimmed,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', height: 30, gap: 1.5 },
  bar: { flex: 1, borderRadius: 1.5 },
  dimmed: { opacity: 0.35 },
});
