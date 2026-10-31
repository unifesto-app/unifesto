import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { CheckinStats } from '../../lib/api/checkin';
import ShadeCard from '../ui/ShadeCard';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const fmt = (n: number) => n.toLocaleString('en-IN');

/**
 * The hub's hero, on the door's mint shade: "128 of 240 checked in", an
 * animated progress bar, and the two numbers door staff ask about (still to
 * come, and the rate).
 */
export default function CheckinProgressCard({ stats, loading }: { stats: CheckinStats | null; loading?: boolean }) {
  const c = useCosmos();
  const total = stats?.total ?? 0;
  const checkedIn = stats?.checkedIn ?? 0;
  const ratio = total > 0 ? Math.min(1, checkedIn / total) : 0;

  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(ratio, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [ratio, width]);
  const bar = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <ShadeCard tone="mint" style={styles.card}>
      {loading && !stats ? (
        <View style={{ gap: spacing[3] }}>
          <Skeleton width={140} height={40} />
          <Skeleton height={8} borderRadius={borderRadius.full} />
          <Skeleton width={180} height={14} />
        </View>
      ) : (
        <>
          <View>
            <Text style={[styles.label, { color: c.soft }]}>Checked in</Text>
            <Text style={[styles.big, { color: c.mint }]} accessibilityLabel={`${fmt(checkedIn)} of ${fmt(total)} checked in`}>
              {fmt(checkedIn)}
              <Text style={[styles.of, { color: c.muted }]}>{` of ${fmt(total)}`}</Text>
            </Text>
          </View>

          <View style={[styles.track, { backgroundColor: c.tint }]}>
            <Animated.View style={[styles.fill, { backgroundColor: c.mint }, bar]} />
          </View>

          <View style={styles.split}>
            <Figure label="Still to come" value={fmt(stats?.remaining ?? Math.max(0, total - checkedIn))} />
            <Figure label="Checked-in rate" value={`${Math.round(ratio * 100)}%`} />
            {stats?.cancelled ? <Figure label="Cancelled" value={fmt(stats.cancelled)} /> : null}
          </View>
        </>
      )}
    </ShadeCard>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const c = useCosmos();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[styles.figure, { color: c.text }]}>{value}</Text>
      <Text style={[styles.figureLabel, { color: c.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing[4] },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  big: { marginTop: spacing[1], fontSize: 44, lineHeight: 52, ...cosmosFont.figure },
  of: { fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  track: { height: 8, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: borderRadius.full },
  split: { flexDirection: 'row', gap: spacing[4] },
  figure: { fontSize: typography.fontSize.xl, ...cosmosFont.figure },
  figureLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
});
