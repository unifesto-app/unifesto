import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { CardBackdrop } from '../ui/CardSurface';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const BARS_HEIGHT = 56;

export interface Stat {
  label: string;
  value: string;
}

/** One bar per day, scaled to the busiest day. Empty days show a hairline. */
export function DailyBars({ values, caption }: { values: number[]; caption?: string }) {
  const tokens = useTokens();
  const max = Math.max(1, ...values);
  return (
    <View>
      <View style={styles.bars} accessibilityLabel={caption}>
        {values.map((v, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: v > 0 ? Math.max(3, (v / max) * BARS_HEIGHT) : 1,
                backgroundColor: v > 0 ? tokens.accent : tokens.border,
              },
            ]}
          />
        ))}
      </View>
      {caption ? <Text style={[styles.caption, { color: tokens.textMuted }]}>{caption}</Text> : null}
    </View>
  );
}

/**
 * The traffic card at the top of Tracking screens: up to four headline numbers
 * in a grid and the daily bars under them.
 */
export function TrafficSummary({ stats, daily, caption }: { stats: Stat[]; daily: number[]; caption: string }) {
  const tokens = useTokens();
  return (
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.cell}>
            <Text style={[styles.value, { color: tokens.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </Text>
            <Text style={[styles.label, { color: tokens.textMuted }]} numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <DailyBars values={daily} caption={caption} />
    </View>
  );
}

export const fmt = (n: number) => n.toLocaleString('en-IN');

const styles = StyleSheet.create({
  card: { marginTop: spacing[4], padding: spacing[5], borderRadius: borderRadius.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[4], marginBottom: spacing[5] },
  cell: { width: '50%', paddingRight: spacing[2] },
  value: { fontSize: 28, lineHeight: 34, ...font('heading') },
  label: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  bars: { height: BARS_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  caption: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...font() },
});
