import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowCounterClockwise,
  Buildings,
  ChartBar,
  CreditCard,
  Eye,
  Funnel,
  Globe,
  IdentificationCard,
  Medal,
  Lifebuoy,
  PaintBrush,
  Plus,
  TreeStructure,
  UsersThree,
  Wallet,
} from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useManageSpace, type ManageTab } from '../hooks/useManageSpace';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { hostingRoleLabel } from '../lib/spaceSections';
import type { ManagedEvent } from '../lib/api/manageSpace';
import ManageStats from '../components/manage/ManageStats';
import ManageEventRow, { ManageEventRowSkeleton } from '../components/manage/ManageEventRow';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;
const LOGO = 64;
const SPACE_WEB_URL = 'https://space.unifesto.app';

const TABS: { key: ManageTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'past', label: 'Past' },
];

const EMPTY: Record<ManageTab, string> = {
  upcoming: 'No upcoming events.',
  drafts: 'No drafts. Everything is published.',
  past: 'No past events yet.',
};

const openWeb = (path = '') =>
  Linking.openURL(`${SPACE_WEB_URL}${path}`).catch(() => AppAlert.alert('Error', 'Unable to open Unifesto Space'));

/**
 * Operator view of one space: stats, events by state (drafts included), money,
 * space setup and team. Reached from the Space tab.
 */
export default function ManageSpaceScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const m = useManageSpace(spaceId);

  useAnalyticsScreenTracking('ManageSpace');

  const now = new Date();
  const list = m.buckets[m.tab];

  const isSpaceAdmin = m.space?.userRole?.code === 'SPACE_ADMIN';
  const openEvent = (e: ManagedEvent) => router.push(`/manage/event/${e.id}`);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={m.refreshing}
          onRefresh={m.refresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {/* Identity */}
      <View style={styles.hero}>
        {m.space?.logo_url ? (
          <Image source={{ uri: m.space.logo_url }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, styles.logoEmpty, { backgroundColor: tokens.elevated }]}>
            <Buildings size={32} color={tokens.accent} weight="fill" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: tokens.text }]} numberOfLines={2}>
            {m.space?.name ?? 'Space'}
          </Text>
          <Text style={[styles.role, { color: tokens.textMuted }]} numberOfLines={1}>
            {[m.space && hostingRoleLabel(m.space), m.space?.slug && `@${m.space.slug}`].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: spacing[6] }}>
        <ManageStats
          loading={m.loading}
          stats={[
            { label: 'Upcoming', value: m.stats.upcoming },
            { label: 'Attending', value: m.stats.attending },
            { label: 'Drafts', value: m.stats.drafts },
          ]}
        />
      </View>

      {/* Events */}
      <View style={styles.sectionRow}>
        <Text style={[styles.section, { color: tokens.text }]}>Events</Text>
        {/* Creating events needs space:create-event, which only Space Admins hold. */}
        {isSpaceAdmin ? (
          <Button
            label="New event"
            size="sm"
            variant="secondary"
            icon={<Plus size={16} color={tokens.text} weight="bold" />}
            onPress={() => router.push(`/manage/space/${spaceId}/new-event`)}
          />
        ) : null}
      </View>
      <SegmentedTabs tabs={TABS} value={m.tab} onChange={m.setTab} />

      <View style={styles.list}>
        {m.loading ? (
          [0, 1, 2].map((i) => <ManageEventRowSkeleton key={i} />)
        ) : m.error ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: tokens.textMuted }]}>{m.error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void m.retry()} style={{ marginTop: spacing[3] }} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: tokens.textMuted }]}>{EMPTY[m.tab]}</Text>
          </View>
        ) : (
          list.map((e) => (
            <ManageEventRow
              key={e.id}
              event={e}
              now={now}
              onPress={() => openEvent(e)}
            />
          ))
        )}
      </View>

      {/* Money — every finance endpoint is Space-Admin only, so the rows are too. */}
      {isSpaceAdmin ? (
        <View style={{ marginTop: spacing[8] }}>
          <SettingsGroup title="Money">
            <SettingsRow
              icon={<Wallet size={ICON} color={tokens.accent} weight="fill" />}
              label="Finance"
              onPress={() => router.push(`/manage/space/${spaceId}/finance`)}
            />
            <SettingsRow
              icon={<ArrowCounterClockwise size={ICON} color={tokens.accent} weight="fill" />}
              label="Refund requests"
              onPress={() => router.push(`/manage/space/${spaceId}/refunds`)}
            />
          </SettingsGroup>
        </View>
      ) : null}

      {/* Space setup — profile, branding and plan are Space-Admin capabilities. */}
      {isSpaceAdmin ? (
        <View style={{ marginTop: spacing[2] }}>
          <SettingsGroup title="Space">
            <SettingsRow
              icon={<IdentificationCard size={ICON} color={tokens.accent} weight="fill" />}
              label="Profile"
              onPress={() => router.push(`/manage/space/${spaceId}/settings`)}
            />
            <SettingsRow
              icon={<PaintBrush size={ICON} color={tokens.accent} weight="fill" />}
              label="Branding"
              onPress={() => router.push(`/manage/space/${spaceId}/white-label`)}
            />
            <SettingsRow
              icon={<CreditCard size={ICON} color={tokens.accent} weight="fill" />}
              label="Plan and billing"
              onPress={() => router.push(`/manage/space/${spaceId}/billing`)}
            />
            {/* Only parent (SUPER) spaces have sub-spaces to roll up. */}
            {m.space?.type === 'SUPER' ? (
              <SettingsRow
                icon={<TreeStructure size={ICON} color={tokens.accent} weight="fill" />}
                label="Sub-spaces"
                onPress={() => router.push(`/manage/space/${spaceId}/subspaces`)}
              />
            ) : null}
            <SettingsRow
              icon={<Lifebuoy size={ICON} color={tokens.accent} weight="fill" />}
              label="Support"
              onPress={() => router.push(`/manage/space/${spaceId}/support`)}
            />
          </SettingsGroup>
        </View>
      ) : null}

      {/* Sponsors — space:manage-sponsors. Only Space Admins pass in practice: the
          Curator grant is event-scoped and can't satisfy this space-level action. */}
      {isSpaceAdmin ? (
        <View style={{ marginTop: spacing[2] }}>
          <SettingsGroup title="Sponsors">
            <SettingsRow
              icon={<Medal size={ICON} color={tokens.accent} weight="fill" />}
              label="Sponsors and tiers"
              onPress={() => router.push(`/manage/space/${spaceId}/sponsors`)}
            />
            <SettingsRow
              icon={<Funnel size={ICON} color={tokens.accent} weight="fill" />}
              label="Leads"
              onPress={() => router.push(`/manage/space/${spaceId}/leads`)}
            />
          </SettingsGroup>
        </View>
      ) : null}

      {/* Team — only Space Admins can list members; hidden for everyone else. */}
      {m.team ? (
        <View style={{ marginTop: spacing[2] }}>
          <SettingsGroup title={`Team · ${m.team.total}`} action={{ label: 'Manage', onPress: () => router.push(`/manage/space/${spaceId}/members`) }}>
            {m.team.members.slice(0, 4).map((mem) => (
              <SettingsRow
                key={mem.id}
                icon={
                  mem.user.avatarUrl ? (
                    <Image source={{ uri: mem.user.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <UsersThree size={ICON} color={tokens.accent} weight="fill" />
                  )
                }
                label={mem.user.fullName || mem.user.username || 'Member'}
                value={mem.role.name}
                onPress={() => router.push(`/manage/space/${spaceId}/members`)}
              />
            ))}
          </SettingsGroup>
        </View>
      ) : null}

      {/* Tracking — counts only; the server gates it with space:view. */}
      {m.space ? (
        <View style={{ marginTop: spacing[6] }}>
          <SettingsGroup>
            <SettingsRow
              icon={<ChartBar size={ICON} color={tokens.accent} weight="fill" />}
              label="Tracking"
              onPress={() =>
                router.push({
                  pathname: `/manage/space/${spaceId}/tracking`,
                  params: { slug: m.space!.slug ?? '', name: m.space!.name ?? '' },
                })
              }
            />
          </SettingsGroup>
        </View>
      ) : null}

      <View style={{ marginTop: spacing[6] }}>
        <SettingsGroup>
          {m.space?.slug ? (
            <SettingsRow
              icon={<Eye size={ICON} color={tokens.accent} weight="fill" />}
              label="View public page"
              onPress={() => router.push(`/space/${m.space!.slug}`)}
            />
          ) : null}
          <SettingsRow
            icon={<Globe size={ICON} color={tokens.accent} weight="fill" />}
            label="Open in Unifesto Space"
            external
            onPress={() => openWeb('/dashboard')}
          />
        </SettingsGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  logo: { width: LOGO, height: LOGO, borderRadius: borderRadius.lg },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: typography.fontSize['2xl'], lineHeight: typography.fontSize['2xl'] * 1.15, ...font('heading') },
  role: { marginTop: 4, fontSize: typography.fontSize.sm, ...font('medium') },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[8], marginBottom: spacing[3] },
  section: { fontSize: typography.fontSize.lg, ...font('heading') },
  list: { marginTop: spacing[4], gap: spacing[3] },
  empty: { alignItems: 'center', paddingVertical: spacing[10] },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  avatar: { width: ICON, height: ICON, borderRadius: ICON / 2 },
});
