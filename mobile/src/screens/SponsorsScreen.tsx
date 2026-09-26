import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSponsors, getTiers, type Sponsor, type SponsorTier } from '../lib/api/spaceSponsors';
import { getUsage } from '../lib/api/billing';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import SponsorMark from '../components/manage/SponsorMark';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { CardBackdrop } from '../components/ui/CardSurface';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;

type Tab = 'sponsors' | 'tiers';
const TABS: { key: Tab; label: string }[] = [
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'tiers', label: 'Tiers' },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The space's sponsor roster (add once, attach to any event) and its tier
 * ladder (Platinum, Gold…). Attaching to events happens from each event's hub.
 */
export default function SponsorsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [tab, setTab] = useState<Tab>('sponsors');
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [tiers, setTiers] = useState<SponsorTier[]>([]);
  // null = unknown (usage call failed); the server still enforces the plan.
  const [onPlan, setOnPlan] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Sponsors');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const [s, t, u] = await Promise.all([getSponsors(spaceId), getTiers(spaceId), getUsage(spaceId)]);
    if (s.ok) {
      setSponsors(s.data);
      setError('');
    } else {
      setError(s.denied ? 'Only Space admins can manage sponsors.' : s.message);
      setSponsors((prev) => prev ?? []);
    }
    if (t.ok) setTiers([...t.data].sort((a, b) => a.rank - b.rank));
    if (u.ok) setOnPlan(u.data.features.hasSponsors === true);
  }, [spaceId]);

  // Refetch on focus so edits made in the editors show on return.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openSponsor = (sponsorId: string) => router.push({ pathname: `/manage/space/${spaceId}/sponsor`, params: { sponsorId } });
  const openTier = (tierId: string) => router.push({ pathname: `/manage/space/${spaceId}/sponsor-tier`, params: { tierId } });

  if (!sponsors) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {onPlan === false ? (
        <View style={styles.notice}>
          <CardBackdrop shape={styles.notice} />
          <Text style={[styles.noticeTitle, { color: tokens.text }]}>Not on this space's plan</Text>
          <Text style={[styles.noticeBody, { color: tokens.textSecondary }]}>
            You can look through what's here, but adding or changing sponsors needs a plan that includes Sponsors and leads.
          </Text>
        </View>
      ) : null}
      {error ? <Text style={[styles.intro, { color: tokens.danger }]}>{error}</Text> : null}

      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'sponsors' ? (
        <>
          <Text style={[styles.intro, { color: tokens.textSecondary }]}>
            Add a sponsor once, then attach it to any of your events from the event's page.
          </Text>
          <SettingsGroup>
            {sponsors.length === 0 ? <SettingsRow label="No sponsors yet" /> : null}
            {sponsors.map((s) => {
              const events = s._count?.eventSponsors ?? 0;
              return (
                <SettingsRow
                  key={s.id}
                  icon={<SponsorMark name={s.name} logoUrl={s.logoUrl} size={ICON} />}
                  label={s.name}
                  value={events ? plural(events, 'event') : 'Not on an event'}
                  onPress={() => openSponsor(s.id)}
                />
              );
            })}
          </SettingsGroup>
          <Button
            label="Add sponsor"
            variant="secondary"
            fullWidth
            disabled={onPlan === false}
            icon={<Plus size={18} color={tokens.text} weight="bold" />}
            onPress={() => openSponsor('new')}
            style={{ marginTop: spacing[5] }}
          />
        </>
      ) : (
        <>
          <Text style={[styles.intro, { color: tokens.textSecondary }]}>
            Tiers group and order sponsors on event pages, top rank first. They're optional: sponsors without a tier still show.
          </Text>
          <SettingsGroup>
            {tiers.length === 0 ? <SettingsRow label="No tiers yet" /> : null}
            {tiers.map((t) => (
              <SettingsRow
                key={t.id}
                icon={<View style={[styles.swatch, { backgroundColor: t.color || tokens.elevated }]} />}
                label={t.name}
                value={`Rank ${t.rank}`}
                onPress={() => openTier(t.id)}
              />
            ))}
          </SettingsGroup>
          <Button
            label="Add tier"
            variant="secondary"
            fullWidth
            disabled={onPlan === false}
            icon={<Plus size={18} color={tokens.text} weight="bold" />}
            onPress={() => openTier('new')}
            style={{ marginTop: spacing[5] }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: {
    marginTop: spacing[4],
    marginLeft: spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...font(),
  },
  notice: { padding: spacing[4], borderRadius: borderRadius.lg, marginBottom: spacing[4], gap: spacing[1] },
  noticeTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  noticeBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  swatch: { width: ICON - 6, height: ICON - 6, borderRadius: borderRadius.sm },
});
