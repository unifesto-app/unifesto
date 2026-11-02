import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import { getSponsors, getTiers, type Sponsor, type SponsorTier } from '../lib/api/spaceSponsors';
import { getUsage } from '../lib/api/billing';
import SponsorMark from '../components/manage/SponsorMark';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 28;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The space's sponsor roster (add once, attach to any event) and its tier
 * ladder (Platinum, Gold…), one under the other. Attaching to events happens
 * from each event's hub. Both are rows on the page with full hairlines, each
 * closed by its sky Add row (muted and inert while Sponsors and leads are off
 * for this space; Unifesto turns them on).
 */
export default function SponsorsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [tiers, setTiers] = useState<SponsorTier[]>([]);
  // Sponsors and leads switched on for this space. null = unknown (usage call
  // failed); the server still refuses writes when they're off.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
    if (u.ok) setEnabled(u.data.features.hasSponsors === true);
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

  const locked = enabled === false;
  // Adding is an action, so sky; muted while it's off.
  const add = locked ? c.muted : c.sky;

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      {locked ? (
        <View style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: c.warn }]}>Sponsors aren't on for this space yet</Text>
          <Text style={[styles.noticeBody, { color: c.soft }]}>
            You can look through what's here. To add or change sponsors, ask Unifesto to turn on Sponsors and leads for this space.
          </Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.notice}>
          <Text style={[styles.noticeBody, { color: c.danger }]}>{error}</Text>
        </View>
      ) : null}

      <SettingsGroup flat title="Sponsors" style={[styles.group, styles.first]}>
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
          <SettingsRow
            icon={<Plus size={ICON} color={add} />}
            label="Add sponsor"
            accent={add}
            onPress={locked ? undefined : () => openSponsor('new')}
          />
      </SettingsGroup>

      <SettingsGroup flat title="Tiers" style={styles.group}>
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
          <SettingsRow icon={<Plus size={ICON} color={add} />} label="Add tier" accent={add} onPress={locked ? undefined : () => openTier('new')} />
      </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  // A notice on the page, not a card: its colour carries it.
  notice: { marginHorizontal: GUTTER + spacing[1], marginTop: spacing[4], gap: spacing[1] },
  noticeTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  noticeBody: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  first: { marginTop: spacing[6] },
  // Grouped lists: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
  // A tier's colour as a round dot: bare, no tile behind it.
  swatch: { width: 18, height: 18, borderRadius: 9 },
});
