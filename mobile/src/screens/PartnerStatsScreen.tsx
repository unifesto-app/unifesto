import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CopySimple, Eye, ShareNetwork } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import { getPartnerStats, type PartnerStats } from '../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { shareLink } from '../lib/share';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];
const ICON = 28;
const DAYS = 14;
const BAR_MAX_H = 96;

/** "2026-09-25" for `n` days before today, in IST like the server's buckets. */
const istDayOffset = (n: number) =>
  new Date(Date.now() + 330 * 60_000 - n * 86_400_000).toISOString().slice(0, 10);

/**
 * A partner's view of one event: how many confirmed registrations their link
 * brought in, a 14-day trend, and the link itself to keep sharing. Counts only
 * — the server never sends attendee details to partners.
 */
export default function PartnerStatsScreen() {
  const { linkId } = useLocalSearchParams<{ linkId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!linkId) return;
    const res = await getPartnerStats(linkId);
    if (res.ok) {
      setStats(res.data);
      setError('');
    } else setError(res.message);
  }, [linkId]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // Last 14 IST days, oldest first, zero-filled.
  const bars = useMemo(() => {
    const counts = new Map((stats?.daily ?? []).map((d) => [d.date, d.count]));
    return Array.from({ length: DAYS }, (_, i) => {
      const date = istDayOffset(DAYS - 1 - i);
      return { date, count: counts.get(date) ?? 0 };
    });
  }, [stats]);
  const peak = Math.max(1, ...bars.map((b) => b.count));
  const lastTwoWeeks = bars.reduce((n, b) => n + b.count, 0);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={[styles.muted, { color: c.muted, textAlign: 'center' }]}>
          {error || 'These stats are no longer available.'}
        </Text>
        <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
      </View>
    );
  }

  const icon = (I: typeof Eye) => <I size={ICON} color={c.text} />;
  const e = stats.event;

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(stats.trackingUrl);
      AppAlert.alert('Link copied', `Registrations through it count for ${stats.name}.`);
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.primary}
        />
      }
    >
      <View style={styles.header}>
        {e.coverImageUrl ? <Image source={{ uri: e.coverImageUrl }} style={styles.cover} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.event, { color: c.text }]} numberOfLines={3}>{e.title}</Text>
          <Text style={[styles.muted, { color: c.muted }]} numberOfLines={1}>
            {e.space?.name ? `${e.space.name} · ` : ''}Partner as {stats.name}
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <CardBackdrop shape={styles.hero} />
        <Text style={[styles.big, { color: c.text }]}>{stats.registrations.toLocaleString('en-IN')}</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          {stats.registrations === 1 ? 'person registered' : 'people registered'} through your link
        </Text>
        <View style={styles.subStats}>
          <Text style={[styles.sub, { color: c.text }]}>
            {stats.today} <Text style={{ color: c.muted }}>today</Text>
          </Text>
          <Text style={[styles.sub, { color: c.text }]}>
            {lastTwoWeeks} <Text style={{ color: c.muted }}>last 14 days</Text>
          </Text>
        </View>

        <View style={styles.chart} accessibilityLabel={`Registrations per day over the last ${DAYS} days`}>
          {bars.map((b) => (
            <View key={b.date} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: b.count ? Math.max(4, (b.count / peak) * BAR_MAX_H) : 2,
                    backgroundColor: b.count ? c.primary : c.tint,
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.axis}>
          <Text style={[styles.axisLabel, { color: c.muted }]}>
            {new Date(bars[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
          <Text style={[styles.axisLabel, { color: c.muted }]}>Today</Text>
        </View>
      </View>
      <Text style={[styles.note, { color: c.muted }]}>
        Counts confirmed registrations only. A registration counts for you when the person opened your link within 7 days before registering.
      </Text>

      <View style={{ marginTop: spacing[8] }}>
        <SettingsGroup title="Your link">
          <SettingsRow
            icon={icon(ShareNetwork)}
            label="Share link"
            onPress={() => void shareLink({ message: e.title, url: stats.trackingUrl, title: e.title })}
          />
          <SettingsRow icon={icon(CopySimple)} label="Copy link" onPress={() => void copyLink()} />
          <SettingsRow icon={icon(Eye)} label="View event" onPress={() => router.push(`/event/${e.slug || e.id}`)} />
        </SettingsGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  cover: { width: 96, height: 72, borderRadius: borderRadius.lg }, // 4:3
  event: { fontSize: typography.fontSize.xl, ...cosmosFont.display },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  hero: { marginTop: spacing[6], padding: spacing[5], borderRadius: borderRadius.xl },
  big: { fontSize: 48, lineHeight: 56, ...cosmosFont.display },
  subStats: { flexDirection: 'row', gap: spacing[5], marginTop: spacing[3] },
  sub: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_MAX_H, gap: 4, marginTop: spacing[5] },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[2] },
  axisLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
