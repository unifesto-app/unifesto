import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const BARS_HEIGHT = 56;

export interface Stat {
  label: string;
  value: string;
}

/** One bar per day, scaled to the busiest day. Empty days show a hairline. */
export function DailyBars({ values, caption }: { values: number[]; caption?: string }) {
  const c = useCosmos();
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
                backgroundColor: v > 0 ? c.primary : c.border,
              },
            ]}
          />
        ))}
      </View>
      {caption ? <Text style={[styles.caption, { color: c.muted }]}>{caption}</Text> : null}
    </View>
  );
}

/**
 * The traffic card at the top of Tracking screens: up to four headline numbers
 * in a grid and the daily bars under them.
 */
export function TrafficSummary({ stats, daily, caption }: { stats: Stat[]; daily: number[]; caption: string }) {
  const c = useCosmos();
  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.cell}>
            <Text style={[styles.value, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </Text>
            <Text style={[styles.label, { color: c.muted }]} numberOfLines={1}>
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
  card: { marginTop: spacing[4], padding: spacing[5], borderRadius: cosmosCardRadius },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[4], marginBottom: spacing[5] },
  cell: { width: '50%', paddingRight: spacing[2] },
  value: { fontSize: 22, lineHeight: 30, ...cosmosFont.display },
  label: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  bars: { height: BARS_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  caption: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
});
