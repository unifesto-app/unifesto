import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ShadeCard from '../ui/ShadeCard';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const BARS_HEIGHT = 56;

export interface Stat {
  label: string;
  value: string;
}

/** One bar per day, scaled to the busiest day, in the card's sky. Empty days show a hairline. */
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
                backgroundColor: v > 0 ? c.sky : c.border,
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
 * The traffic card at the top of Tracking screens, on the sky shade (visits and
 * registrations): the first stat as the hero figure, the rest in a row under
 * it, then the daily bars.
 */
export function TrafficSummary({ stats, daily, caption }: { stats: Stat[]; daily: number[]; caption: string }) {
  const c = useCosmos();
  const [hero, ...rest] = stats;
  return (
    <ShadeCard tone="sky" style={styles.card}>
      {hero ? (
        <View accessible accessibilityLabel={`${hero.label} ${hero.value}`}>
          <Text style={[styles.heroLabel, { color: c.soft }]}>{hero.label}</Text>
          <Text style={[styles.hero, { color: c.sky }]} numberOfLines={1} adjustsFontSizeToFit>
            {hero.value}
          </Text>
        </View>
      ) : null}
      {rest.length > 0 ? (
        <View style={styles.row}>
          {rest.map((s) => (
            <View key={s.label} style={styles.cell}>
              <Text style={[styles.value, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text style={[styles.label, { color: c.muted }]} numberOfLines={2}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <DailyBars values={daily} caption={caption} />
    </ShadeCard>
  );
}

export const fmt = (n: number) => n.toLocaleString('en-IN');

const styles = StyleSheet.create({
  card: { marginTop: spacing[4] },
  heroLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  hero: { marginTop: spacing[1], fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  row: { flexDirection: 'row', gap: spacing[4], marginTop: spacing[4], marginBottom: spacing[5] },
  cell: { flex: 1 },
  value: { fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.figure },
  label: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.35, ...cosmosFont.body },
  bars: { height: BARS_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  caption: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
});
