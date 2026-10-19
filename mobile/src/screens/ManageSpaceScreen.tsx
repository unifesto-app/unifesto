import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowCounterClockwise,
  ChartBar,
  CreditCard,
  Funnel,
  Globe,
  IdentificationCard,
  Lifebuoy,
  Medal,
  PaintBrush,
  Plus,
  TreeStructure,
  Wallet,
} from '@unifesto/unicon/react-native';
import { useManageSpace, type ManageTab } from '../hooks/useManageSpace';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { hostingRoleLabel } from '../lib/spaceSections';
import type { ManagedEvent } from '../lib/api/manageSpace';
import { getSpaceDeskUnread } from '../lib/api/support';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import Skeleton from '../components/Skeleton';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import { Monogram } from '../components/home/SpaceCards';
import ManageEventRow, { ManageEventRowSkeleton } from '../components/manage/ManageEventRow';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;
const LOGO = 56;
const AVATAR = 28;
const SPACE_WEB_URL = 'https://space.unifesto.app';

const TAB_LABELS: Record<ManageTab, string> = { upcoming: 'Upcoming', drafts: 'Drafts', past: 'Past' };

const EMPTY: Record<ManageTab, string> = {
  upcoming: 'No upcoming events.',
  drafts: 'No drafts. Everything is published.',
  past: 'No past events yet.',
};

const openWeb = (path = '') =>
  Linking.openURL(`${SPACE_WEB_URL}${path}`).catch(() => AppAlert.alert('Error', 'Unable to open Unifesto Space'));

/**
 * Operator view of one space, in the cosmos theme. Top to bottom: who the space
 * is (with its numbers and the two things you do most), its events by state,
 * then team, money, sponsors and setup for Space Admins, and the web door last.
 */
export default function ManageSpaceScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const m = useManageSpace(spaceId);

  useAnalyticsScreenTracking('ManageSpace');

  const now = new Date();
  const list = m.buckets[m.tab];
  const isSpaceAdmin = m.space?.userRole?.code === 'SPACE_ADMIN';
  const go = (path: string) => () => router.push(`/manage/space/${spaceId}/${path}` as never);
  const glyph = { size: ICON, color: c.text, weight: 'fill' as const };
  // Assist desk: null while loading or for someone who works no part of it (403).
  const [deskUnread, setDeskUnread] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      void getSpaceDeskUnread(spaceId).then((r) => setDeskUnread(r.ok ? r.data.unread : null));
    }, [spaceId]),
  );

  // Counts ride in the tab labels once loaded, so an empty tab never needs a tap to find out.
  const tabs = (Object.keys(TAB_LABELS) as ManageTab[]).map((key) => {
    const n = m.buckets[key].length;
    return { key, label: m.loading || n === 0 ? TAB_LABELS[key] : `${TAB_LABELS[key]} ${n}` };
  });

  const name = m.space?.name ?? 'Space';
  const sub = [m.space && hostingRoleLabel(m.space), m.space?.slug && `@${m.space.slug}`].filter(Boolean).join('  ·  ');
  const stats = [
    { label: 'Upcoming', value: m.stats.upcoming },
    { label: 'Attending', value: m.stats.attending },
    { label: 'Drafts', value: m.stats.drafts },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing + spacing[2], paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={m.refreshing}
            onRefresh={m.refresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {/* Identity: logo, name, my role, the numbers, the two everyday actions. */}
        <View style={styles.pad}>
          <View style={[styles.hero, { backgroundColor: c.raised }]}>
            <View style={styles.top}>
              {m.space?.logo_url ? (
                <Image source={{ uri: m.space.logo_url }} style={[styles.logo, { backgroundColor: c.card }]} contentFit="cover" />
              ) : (
                <Monogram name={name} size={LOGO} radius={14} />
              )}
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={[styles.name, { color: c.text }]} numberOfLines={2}>
                  {name}
                </Text>
                {sub ? <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>{sub}</Text> : null}
              </View>
            </View>

            <View style={[styles.stats, { borderTopColor: c.border }]}>
              {stats.map((s) => (
                <View
                  key={s.label}
                  style={styles.stat}
                  accessible
                  accessibilityLabel={m.loading ? `${s.label}, loading` : `${s.label}, ${s.value}`}
                >
                  {m.loading ? (
                    <Skeleton width={28} height={22} borderRadius={6} />
                  ) : (
                    <Text style={[styles.statValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {s.value.toLocaleString('en-IN')}
                    </Text>
                  )}
                  <Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={1}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Creating events needs space:create-event, which only Space Admins hold. */}
            {isSpaceAdmin || m.space?.slug ? (
              <View style={styles.actions}>
                {isSpaceAdmin ? (
                  <AuthButton
                    label="New event"
                    icon={<Plus size={16} color={c.primaryFg} weight="bold" />}
                    onPress={go('new-event')}
                    style={styles.action}
                  />
                ) : null}
                {m.space?.slug ? (
                  <AuthButton
                    label="Public page"
                    variant="secondary"
                    onPress={() => router.push(`/space/${m.space!.slug}`)}
                    style={styles.action}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Events */}
        <Section title="Events" style={styles.firstSection}>
          <View style={styles.pad}>
            <SegmentedTabs tabs={tabs} value={m.tab} onChange={m.setTab} />
            <View style={styles.list}>
              {m.loading ? (
                [0, 1, 2].map((i) => <ManageEventRowSkeleton key={i} />)
              ) : m.error ? (
                <View style={[styles.empty, { backgroundColor: c.raised }]}>
                  <Text style={[styles.emptyText, { color: c.soft }]}>{m.error}</Text>
                  <AuthButton label="Try again" variant="secondary" onPress={() => void m.retry()} style={{ marginTop: spacing[4], alignSelf: 'stretch' }} />
                </View>
              ) : list.length === 0 ? (
                <View style={[styles.empty, { backgroundColor: c.raised }]}>
                  <Text style={[styles.emptyText, { color: c.soft }]}>{EMPTY[m.tab]}</Text>
                </View>
              ) : (
                list.map((e: ManagedEvent) => (
                  <ManageEventRow key={e.id} event={e} now={now} onPress={() => router.push(`/manage/event/${e.id}`)} />
                ))
              )}
            </View>
          </View>
        </Section>

        {/* Team — only Space Admins can list members; the server returns null for everyone else. */}
        {m.team ? (
          <Section title="Team" subtitle={`${m.team.total} ${m.team.total === 1 ? 'member' : 'members'}`} onSeeAll={go('members')}>
            <SettingsGroup style={styles.group}>
              {m.team.members.slice(0, 4).map((mem) => {
                const who = mem.user.fullName || mem.user.username || 'Member';
                return (
                  <SettingsRow
                    key={mem.id}
                    icon={
                      mem.user.avatarUrl ? (
                        <Image source={{ uri: mem.user.avatarUrl }} style={[styles.avatar, { backgroundColor: c.card }]} />
                      ) : (
                        <Monogram name={who} size={AVATAR} radius={AVATAR / 2} />
                      )
                    }
                    label={who}
                    value={mem.role.name}
                    onPress={go('members')}
                  />
                );
              })}
            </SettingsGroup>
          </Section>
        ) : null}

        {/* Money — every finance endpoint is Space-Admin only, so the rows are too. */}
        {isSpaceAdmin ? (
          <Section title="Money">
            <SettingsGroup style={styles.group}>
              <SettingsRow icon={<Wallet {...glyph} />} label="Finance" onPress={go('finance')} />
              <SettingsRow icon={<ArrowCounterClockwise {...glyph} />} label="Refund requests" onPress={go('refunds')} />
            </SettingsGroup>
          </Section>
        ) : null}

        {/* Sponsors — space:manage-sponsors. Only Space Admins pass in practice: the
            Curator grant is event-scoped and can't satisfy this space-level action. */}
        {isSpaceAdmin ? (
          <Section title="Sponsors">
            <SettingsGroup style={styles.group}>
              <SettingsRow icon={<Medal {...glyph} />} label="Sponsors and tiers" onPress={go('sponsors')} />
              <SettingsRow icon={<Funnel {...glyph} />} label="Leads" onPress={go('leads')} />
            </SettingsGroup>
          </Section>
        ) : null}

        {/* Space setup — profile, branding and plan are Space-Admin capabilities. */}
        {isSpaceAdmin ? (
          <Section title="Space setup">
            <SettingsGroup style={styles.group}>
              <SettingsRow icon={<IdentificationCard {...glyph} />} label="Profile" onPress={go('settings')} />
              <SettingsRow icon={<PaintBrush {...glyph} />} label="Branding" onPress={go('white-label')} />
              <SettingsRow icon={<CreditCard {...glyph} />} label="Plan and billing" onPress={go('billing')} />
              {/* Only parent (SUPER) spaces have sub-spaces to roll up. */}
              {m.space?.type === 'SUPER' ? (
                <SettingsRow icon={<TreeStructure {...glyph} />} label="Sub-spaces" onPress={go('subspaces')} />
              ) : null}
            </SettingsGroup>
          </Section>
        ) : null}

        <Section title="More">
          <SettingsGroup style={styles.group}>
            {/* Tracking — counts only; the server gates it with space:view. */}
            {m.space ? (
              <SettingsRow
                icon={<ChartBar {...glyph} />}
                label="Tracking"
                onPress={() =>
                  router.push({
                    pathname: `/manage/space/${spaceId}/tracking`,
                    params: { slug: m.space!.slug ?? '', name: m.space!.name ?? '' },
                  })
                }
              />
            ) : null}
            {/* Assist desk: Space Admins and the event support teams. */}
            {deskUnread !== null ? (
              <SettingsRow
                icon={<Lifebuoy {...glyph} />}
                label="Assist inbox"
                value={deskUnread ? `${deskUnread} new` : undefined}
                onPress={go(isSpaceAdmin ? 'support?admin=1' : 'support')}
              />
            ) : null}
            <SettingsRow icon={<Globe {...glyph} />} label="Open in Unifesto Space" external onPress={() => openWeb('/dashboard')} />
          </SettingsGroup>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  hero: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  logo: { width: LOGO, height: LOGO, borderRadius: 14, overflow: 'hidden' },
  // Michroma runs wide: 18 reads like a 22 in Hanken.
  name: { fontSize: 18, lineHeight: 26, ...cosmosFont.display },
  sub: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  stats: { flexDirection: 'row', marginTop: spacing[5], paddingTop: spacing[4], borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.display },
  statLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  // minHeight, not height: a fixed height clips the label at large Dynamic Type sizes.
  action: { flex: 1, height: undefined, minHeight: 46, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  firstSection: { marginTop: spacing[10] },
  list: { marginTop: spacing[4], gap: spacing[3] },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
});
