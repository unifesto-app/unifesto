import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { CheckinStats } from '../../lib/api/checkin';
import { CardBackdrop } from '../ui/CardSurface';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const fmt = (n: number) => n.toLocaleString('en-IN');

/**
 * The hub's headline: "128 of 240 checked in", an animated progress bar, and
 * the two numbers door staff ask about (still to come, and the rate).
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
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      {loading && !stats ? (
        <View style={{ gap: spacing[3] }}>
          <Skeleton width={140} height={40} />
          <Skeleton height={10} borderRadius={borderRadius.full} />
          <Skeleton width={180} height={14} />
        </View>
      ) : (
        <>
          <View style={styles.headline}>
            <Text style={[styles.big, { color: c.text }]}>{fmt(checkedIn)}</Text>
            <Text style={[styles.of, { color: c.muted }]}>of {fmt(total)} checked in</Text>
          </View>

          <View style={[styles.track, { backgroundColor: c.tint }]}>
            <Animated.View style={[styles.fill, bar]}>
              <LinearGradient
                colors={[c.soft, c.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          <View style={styles.split}>
            <Figure label="Still to come" value={fmt(stats?.remaining ?? Math.max(0, total - checkedIn))} />
            <Figure label="Checked-in rate" value={`${Math.round(ratio * 100)}%`} />
            {stats?.cancelled ? <Figure label="Cancelled" value={fmt(stats.cancelled)} /> : null}
          </View>
        </>
      )}
    </View>
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
  card: { borderRadius: borderRadius['2xl'], padding: spacing[5], gap: spacing[4] },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2], flexWrap: 'wrap' },
  big: { fontSize: 44, lineHeight: 50, ...cosmosFont.display },
  of: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  track: { height: 10, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: borderRadius.full, overflow: 'hidden' },
  split: { flexDirection: 'row', gap: spacing[4] },
  figure: { fontSize: typography.fontSize.xl, ...cosmosFont.display },
  figureLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
});
