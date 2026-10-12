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
}

/** A row of borderless stat tiles (elevated fill lifts them off the black). */
export default function ManageStats({ stats, loading }: { stats: ManageStat[]; loading?: boolean }) {
  const c = useCosmos();
  return (
    <View style={styles.row}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.tile]}>
          <CardBackdrop shape={styles.tile} />
          {loading ? (
            <Skeleton width={36} height={26} />
          ) : (
            <Text style={[styles.value, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
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
  row: { flexDirection: 'row', gap: spacing[3] },
  tile: { flex: 1, borderRadius: cosmosCardRadius, paddingVertical: spacing[4], paddingHorizontal: spacing[4], gap: 4 },
  value: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
