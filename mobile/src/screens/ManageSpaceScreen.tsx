import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
  UserPlus,
  TreeStructure,
  Wallet,
} from '@unifesto/unicon/react-native';
import { useManageSpace, type ManageTab } from '../hooks/useManageSpace';
import useTopSpacing from '../hooks/useTopSpacing';
import { hostingRoleLabel } from '../lib/spaceSections';
import type { ManagedEvent } from '../lib/api/manageSpace';
import { getSpaceDeskUnread } from '../lib/api/support';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import ShadeCard from '../components/ui/ShadeCard';
import Skeleton from '../components/Skeleton';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER } from '../components/home/Section';
import { Monogram } from '../components/home/SpaceCards';
import ManageEventRow, { ManageEventRowSkeleton } from '../components/manage/ManageEventRow';
import TabPager from '../components/ui/TabPager';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { openSpaceWeb } from '../lib/openOnWeb';
import { borderRadius, column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 28;
const LOGO = 56;
const AVATAR = 28;

const TAB_LABELS: Record<ManageTab, string> = { upcoming: 'Upcoming', drafts: 'Drafts', past: 'Past' };

const EMPTY: Record<ManageTab, string> = {
  upcoming: 'No upcoming events.',
  drafts: 'No drafts. Everything is published.',
  past: 'No past events yet.',
};

/**
 * Operator view of one space. Top to bottom: who the space is, on its blue
 * shade (with its numbers and the two things you do most), its events by state
 * as rows, then one short list per job: team, money, sponsors, insights,
 * support, space setup, and the web door last. Lists are rows on the page with
 * full hairlines and no blurbs; glyphs carry their job's accent.
 */
export default function ManageSpaceScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const m = useManageSpace(spaceId);

  const now = new Date();
  const isSpaceAdmin = m.space?.userRole?.code === 'SPACE_ADMIN';
  const go = (path: string) => () => router.push(`/manage/space/${spaceId}/${path}` as never);
  // Desk work (creating events, branding, billing) opens on Unifesto Space (D3).
  const web = (path: string) => () => openSpaceWeb(path, spaceId);
  const glyph = { size: ICON, color: c.text };
  const ivory = { size: ICON, color: c.ivory };
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
        contentContainerStyle={[column, { paddingTop: topSpacing + spacing[2], paddingBottom: 120 }]}
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
        {/* Identity: logo, name, my role, the numbers, the two everyday actions.
            The screen's hero, on the Space's blue shade. */}
        <View style={styles.pad}>
          <ShadeCard tone="blue">
            <View style={styles.top}>
              {m.space?.logo_url ? (
                <Image source={{ uri: m.space.logo_url }} style={[styles.logo, { backgroundColor: c.card }]} contentFit="cover" />
              ) : (
                <Monogram name={name} size={LOGO} radius={borderRadius.md} />
              )}
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={[styles.name, { color: c.text }]} numberOfLines={2}>
                  {name}
                </Text>
                {sub ? <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>{sub}</Text> : null}
              </View>
            </View>

            <View style={[styles.stats, { borderTopColor: c.border }]}>
              {stats.map((s, i) => (
                <View
                  key={s.label}
                  style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border }]}
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
                    onPress={web('/events/new')}
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
          </ShadeCard>
        </View>

        {/* Events: the state tabs, then rows on the page with full hairlines. */}
        <View style={[styles.pad, styles.events]}>
          <Text accessibilityRole="header" style={[styles.listTitle, { color: c.muted }]}>Events</Text>
          <TabPager
            inline
            tabs={tabs}
            value={m.tab}
            onChange={m.setTab}
            renderPage={(tab) => (
              <View style={styles.list}>
                {m.loading ? (
                  [0, 1, 2].map((i) => (
                    <View key={i} style={i > 0 && [styles.divider, { borderTopColor: c.border }]}>
                      <ManageEventRowSkeleton />
                    </View>
                  ))
                ) : m.error ? (
                  <View style={styles.empty}>
                    <Text style={[styles.emptyText, { color: c.muted }]}>{m.error}</Text>
                    <AuthButton label="Try again" variant="secondary" onPress={() => void m.retry()} style={{ marginTop: spacing[4], alignSelf: 'stretch' }} />
                  </View>
                ) : m.buckets[tab].length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={[styles.emptyText, { color: c.muted }]}>{EMPTY[tab]}</Text>
                  </View>
                ) : (
                  m.buckets[tab].map((e: ManagedEvent, i) => (
                    <View key={e.id} style={i > 0 && [styles.divider, { borderTopColor: c.border }]}>
                      <ManageEventRow event={e} now={now} onPress={() => router.push(`/manage/event/${e.id}`)} />
                    </View>
                  ))
                )}
              </View>
            )}
          />
        </View>

        {/* Team: only Space Admins can list members; the server returns null for everyone else.
            Adding someone is an action, so it closes the list in sky. */}
        {m.team ? (
          <SettingsGroup flat title="Team" action={{ label: `See all ${m.team.total}`, onPress: go('members') }} style={styles.group}>
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
            <SettingsRow icon={<UserPlus size={ICON} color={c.sky} />} label="Add a member" accent={c.sky} onPress={go('add-member')} />
          </SettingsGroup>
        ) : null}

        {/* Money: every finance endpoint is Space-Admin only, so the rows are too. Ivory. */}
        {isSpaceAdmin ? (
          <SettingsGroup flat title="Money" style={styles.group}>
            <SettingsRow icon={<Wallet {...ivory} />} label="Finance" onPress={go('finance')} />
            <SettingsRow icon={<ArrowCounterClockwise {...ivory} />} label="Refund requests" onPress={go('refunds')} />
          </SettingsGroup>
        ) : null}

        {/* Sponsors: space:manage-sponsors. Only Space Admins pass in practice: the
            Curator grant is event-scoped and can't satisfy this space-level action. */}
        {isSpaceAdmin ? (
          <SettingsGroup flat title="Sponsors" style={styles.group}>
            <SettingsRow icon={<Medal {...glyph} />} label="Sponsors and tiers" onPress={go('sponsors')} />
            <SettingsRow icon={<Funnel {...glyph} />} label="Leads" onPress={go('leads')} />
          </SettingsGroup>
        ) : null}

        {/* Tracking: counts only; the server gates it with space:view. */}
        {m.space ? (
          <SettingsGroup flat title="Insights" style={styles.group}>
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
          </SettingsGroup>
        ) : null}

        {/* Assist desk: Space Admins and the event support teams. */}
        {deskUnread !== null ? (
          <SettingsGroup flat title="Support" style={styles.group}>
            <SettingsRow
              icon={<Lifebuoy {...glyph} />}
              label="Assist inbox"
              value={deskUnread ? `${deskUnread} new` : undefined}
              onPress={go(isSpaceAdmin ? 'support?admin=1' : 'support')}
            />
          </SettingsGroup>
        ) : null}

        {/* Space setup: profile, branding and plan are Space-Admin capabilities. */}
        {isSpaceAdmin ? (
          <SettingsGroup flat title="Space setup" style={styles.group}>
            <SettingsRow icon={<IdentificationCard {...glyph} />} label="Profile" onPress={go('settings')} />
            <SettingsRow icon={<PaintBrush {...glyph} />} label="Branding" external onPress={web('/white-label')} />
            <SettingsRow icon={<CreditCard {...glyph} />} label="Plan and billing" external onPress={web('/billing')} />
            {/* Only parent (SUPER) spaces have sub-spaces to roll up. */}
            {m.space?.type === 'SUPER' ? (
              <SettingsRow icon={<TreeStructure {...glyph} />} label="Sub-spaces" onPress={go('subspaces')} />
            ) : null}
          </SettingsGroup>
        ) : null}

        <SettingsGroup flat title="More" style={styles.group}>
          <SettingsRow icon={<Globe {...glyph} />} label="Open in Unifesto Space" external onPress={web('')} />
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  logo: { width: LOGO, height: LOGO, borderRadius: borderRadius.md, overflow: 'hidden' },
  name: { fontSize: 22, lineHeight: 28, ...cosmosFont.display },
  sub: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  stats: { flexDirection: 'row', marginTop: spacing[5], paddingTop: spacing[4], borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.figure },
  statLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  // minHeight, not height: a fixed height clips the label at large Dynamic Type sizes.
  action: { flex: 1, height: undefined, minHeight: 46, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  events: { marginTop: spacing[8] },
  // Same as SettingsGroup's title: muted Hanken SemiBold, sentence case.
  listTitle: { marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  list: { marginTop: spacing[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  empty: { paddingVertical: spacing[8], alignItems: 'center' },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  // Grouped lists: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
});
