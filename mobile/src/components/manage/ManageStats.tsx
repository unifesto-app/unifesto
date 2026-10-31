import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosCardRadius, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { CardBackdrop } from '../ui/CardSurface';

export interface ManageStat {
  label: string;
  /** Numbers get Indian grouping; strings (e.g. "₹12.4K") show as given. */
  value: number | string;
  /** The figure's card accent, by its job: mint check-in, sky tickets, ivory money. */
  tone?: 'mint' | 'sky' | 'ivory';
}

/** A row of stats on one borderless card: figure over label, divided by hairlines. */
export default function ManageStats({ stats, loading }: { stats: ManageStat[]; loading?: boolean }) {
  const c = useCosmos();
  return (
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      {stats.map((s, i) => (
        <View key={s.label} style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border }]}>
          {loading ? (
            <Skeleton width={36} height={26} />
          ) : (
            <Text style={[styles.value, { color: s.tone ? c[s.tone] : c.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {typeof s.value === 'number' ? s.value.toLocaleString('en-IN') : s.value}
            </Text>
          )}
          <Text style={[styles.label, { color: c.muted }]} numberOfLines={1}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: cosmosCardRadius, paddingVertical: spacing[4] },
  stat: { flex: 1, paddingHorizontal: spacing[4], gap: 4 },
  value: { fontSize: 20, lineHeight: 28, ...cosmosFont.figure },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
