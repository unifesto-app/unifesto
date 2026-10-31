import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CaretRight, CheckCircle } from '@unifesto/unicon/react-native';
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
import PressableScale from '../ui/PressableScale';

interface ApexPanelProps {
  overview: PlatformOverview | null;
  needs: ApexNeed[];
  loading: boolean;
  onOpenNeed: (n: ApexNeed) => void;
}

/** Platform-staff snapshot on Home: headline numbers + every queue waiting on me, one tap each. */
export default function ApexPanel({ overview, needs, loading, onOpenNeed }: ApexPanelProps) {
  const c = useCosmos();
  const ov = overview;

  return (
    <View style={styles.wrap}>
      <ManageStats
        loading={loading && !ov}
        stats={[
          { label: ov ? `Users · +${ov.users.newLast30Days.toLocaleString('en-IN')} in 30d` : 'Users', value: ov?.users.total ?? 0 },
          { label: 'Registrations', value: ov?.registrations.total ?? 0, tone: 'sky' },
          { label: 'Revenue', value: ov ? inrShort(ov.revenue.totalPaid) : 0, tone: 'ivory' },
        ]}
      />

      {loading && needs.length === 0 ? (
        <View>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.need, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <Skeleton width="55%" height={14} />
              <Skeleton width={28} height={18} />
            </View>
          ))}
        </View>
      ) : needs.length === 0 ? (
        <View style={styles.clear}>
          <CardBackdrop shape={styles.clear} />
          <CheckCircle size={24} color={c.success} weight="fill" />
          <Text style={[styles.clearText, { color: c.text }]}>All clear, nothing waiting on me</Text>
        </View>
      ) : (
        // Every queue waiting on me, console style: rows on the page with
        // hairlines between them, the count in amber.
        <View>
          {needs.map((n, i) => (
            <PressableScale
              feedback="inline"
              key={n.key}
              onPress={() => onOpenNeed(n)}
              accessibilityRole="button"
              accessibilityLabel={`${n.count} ${n.label}`}
              style={[styles.need, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}
            >
              <Text style={[styles.needLabel, { color: c.text }]} numberOfLines={1}>
                {n.label}
              </Text>
              <Text style={[styles.needCount, { color: c.warn }]}>{n.count.toLocaleString('en-IN')}</Text>
              <CaretRight size={14} color={c.muted} weight="bold" />
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER, gap: spacing[3] },
  need: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 52, paddingVertical: spacing[3] },
  needLabel: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  needCount: { fontSize: typography.fontSize.lg, ...cosmosFont.figure },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: cosmosCardRadius,
  },
  clearText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
