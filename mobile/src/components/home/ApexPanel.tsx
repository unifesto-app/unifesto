import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { CardBackdrop } from '../ui/CardSurface';
import Skeleton from '../Skeleton';
import ManageStats from '../manage/ManageStats';
import { GUTTER } from './Section';
import { inrShort } from '../../utils/money';
import type { ApexNeed } from '../../hooks/useWorkspaceCards';
import type { PlatformOverview } from '../../lib/api/apex';

interface ApexPanelProps {
  overview: PlatformOverview | null;
  needs: ApexNeed[];
  loading: boolean;
  onOpenNeed: (n: ApexNeed) => void;
}

/** Platform-staff snapshot on Home: headline numbers + every queue waiting on me, one tap each. */
export default function ApexPanel({ overview, needs, loading, onOpenNeed }: ApexPanelProps) {
  const tokens = useTokens();
  const c = useCosmos();
  const ov = overview;

  return (
    <View style={styles.wrap}>
      <ManageStats
        loading={loading && !ov}
        stats={[
          { label: ov ? `Users · +${ov.users.newLast30Days.toLocaleString('en-IN')} in 30d` : 'Users', value: ov?.users.total ?? 0 },
          { label: 'Registrations', value: ov?.registrations.total ?? 0 },
          { label: 'Revenue', value: ov ? inrShort(ov.revenue.totalPaid) : 0 },
        ]}
      />

      {loading && needs.length === 0 ? (
        <View style={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="31%" height={64} borderRadius={cosmosCardRadius} />
          ))}
        </View>
      ) : needs.length === 0 ? (
        <View style={[styles.clear]}>
          <CardBackdrop shape={styles.clear} />
          <CheckCircle size={24} color={tokens.success} weight="fill" />
          <Text style={[styles.clearText, { color: c.text }]}>All clear, nothing waiting on me</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {needs.map((n) => (
            <Pressable
              key={n.key}
              onPress={() => onOpenNeed(n)}
              accessibilityRole="button"
              accessibilityLabel={`${n.count} ${n.label}`}
              style={({ pressed }) => [styles.need, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            >
              <CardBackdrop shape={styles.need} />
              <Text style={[styles.needCount, { color: tokens.warning }]}>{n.count.toLocaleString('en-IN')}</Text>
              <Text style={[styles.needLabel, { color: c.soft }]} numberOfLines={1}>
                {n.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER, gap: spacing[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  need: {
    // Three per row inside the gutter.
    width: '31%',
    flexGrow: 1,
    borderRadius: cosmosCardRadius,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    gap: 2,
  },
  needCount: { fontSize: typography.fontSize.xl, lineHeight: 30, ...cosmosFont.display },
  needLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: cosmosCardRadius,
  },
  clearText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
