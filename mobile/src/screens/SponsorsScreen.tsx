import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSponsors, getTiers, type Sponsor, type SponsorTier } from '../lib/api/spaceSponsors';
import { getUsage } from '../lib/api/billing';
import SponsorMark from '../components/manage/SponsorMark';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 28;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The space's sponsor roster (add once, attach to any event) and its tier
 * ladder (Platinum, Gold…), one under the other. Attaching to events happens
 * from each event's hub.
 */
export default function SponsorsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!sponsors) {
    return (
      <CosmosScreen>
        <View style={styles.pad}>
          <Skeleton width="100%" height={180} borderRadius={cosmosCardRadius} />
          <Skeleton width="100%" height={120} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
        </View>
      </CosmosScreen>
    );
  }

  const locked = onPlan === false;

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      {locked ? (
        <View style={[styles.notice, { backgroundColor: c.raised }]}>
          <Text style={[styles.noticeTitle, { color: c.text }]}>Not on this space's plan</Text>
          <Text style={[styles.noticeBody, { color: c.soft }]}>
            You can look through what's here, but adding or changing sponsors needs a plan that includes Sponsors and leads.
          </Text>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.notice, { backgroundColor: c.raised }]}>
          <Text style={[styles.noticeBody, { color: c.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Section title="Sponsors" subtitle="Add one once, then attach it to any event from the event's page" style={styles.firstSection}>
        <SettingsGroup style={styles.group}>
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
        <View style={[styles.pad, { marginTop: spacing[4] }]}>
          <AuthButton
            label="Add sponsor"
            variant="secondary"
            disabled={locked}
            icon={<Plus size={16} color={c.text} weight="bold" />}
            onPress={() => openSponsor('new')}
          />
        </View>
      </Section>

      <Section title="Tiers" subtitle="Group and order sponsors on event pages, top rank first. Optional">
        <SettingsGroup style={styles.group}>
          {tiers.length === 0 ? <SettingsRow label="No tiers yet" /> : null}
          {tiers.map((t) => (
            <SettingsRow
              key={t.id}
              icon={<View style={[styles.swatch, { backgroundColor: t.color || c.tint }]} />}
              label={t.name}
              value={`Rank ${t.rank}`}
              onPress={() => openTier(t.id)}
            />
          ))}
        </SettingsGroup>
        <View style={[styles.pad, { marginTop: spacing[4] }]}>
          <AuthButton
            label="Add tier"
            variant="secondary"
            disabled={locked}
            icon={<Plus size={16} color={c.text} weight="bold" />}
            onPress={() => openTier('new')}
          />
        </View>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  notice: { marginHorizontal: GUTTER, marginBottom: spacing[3], padding: spacing[5], borderRadius: cosmosCardRadius, gap: spacing[1] },
  noticeTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  noticeBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  firstSection: { marginTop: spacing[4] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  // A tier's colour as a round dot: bare, no tile behind it.
  swatch: { width: 18, height: 18, borderRadius: 9 },
});
