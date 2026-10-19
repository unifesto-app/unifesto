import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CaretRight, CheckCircle, PencilSimple, WarningCircle } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import {
  approveSpace,
  getAdminEvent,
  getAdminUser,
  getChildSpaces,
  getSpaceDetail,
  MANAGEABLE_SPACE_STATUSES,
  rejectSpace,
  updateSpaceStatus,
  type ChildSpace,
  type Result,
} from '../../lib/api/apex';
import { FieldRow } from '../../components/manage/FormFields';
import { Button } from '../../components/ui';
import { getManagedSpaceEvents, type ManagedEvent } from '../../lib/api/manageSpace';
import { titleCase } from '../../lib/apexQueues';
import { longDate, shortDate } from '../../components/apex/ApexRow';
import ManageStats from '../../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { inr, inrShort } from '../../utils/money';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { AppAlert } from '../../components/ui/AppAlert';
import { HeaderActions, HeaderIconButton } from '../../navigation/HeaderActions';

/*
 * Read-only detail screens for Apex lookups. Each loads one record by id and
 * links sideways (user → space, space → event, event → space / sub-event).
 */

const GUTTER = spacing[6];
const nameOf = (u?: { fullName: string | null; username: string | null } | null) =>
  u?.fullName || (u?.username ? `@${u.username}` : '—');

/** Load one record; `denied` becomes a friendly line. */
function useRecord<T>(load: () => Promise<Result<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const run = useCallback(async () => {
    const res = await load();
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, [load]);
  // Reload on focus so edits made on a pushed screen (e.g. Edit user) show.
  useFocusEffect(
    useCallback(() => {
      void run();
    }, [run]),
  );
  const refresh = async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  };
  return { data, error, refreshing, refresh };
}

function Shell({
  title,
  loading,
  error,
  refreshing,
  onRefresh,
  children,
}: {
  title: string;
  loading: boolean;
  error: string;
  refreshing: boolean;
  onRefresh: () => void;
  children?: React.ReactNode;
}) {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  return (
    <>
      <Stack.Screen options={{ title }} />
      {loading ? (
        <View style={[styles.center, { backgroundColor: tokens.bg }]}>
          {error ? <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: tokens.bg }}
          contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
          }
        >
          {children}
        </ScrollView>
      )}
    </>
  );
}

function Hero({ imageUrl, title, lines, square }: { imageUrl?: string | null; title: string; lines: (string | null | undefined)[]; square?: boolean }) {
  const tokens = useTokens();
  return (
    <View style={styles.hero}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={[styles.heroImg, !square && { borderRadius: 32 }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
        {lines.filter(Boolean).map((l) => (
          <Text key={l} style={[styles.muted, { color: tokens.textMuted }]} numberOfLines={2}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── User ─────────────────────────────────────────────────────────────────────

export function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const load = useCallback(() => getAdminUser(id!), [id]);
  const { data, error, refreshing, refresh } = useRecord(load);
  const u = data?.user;

  const verifiedMark = (ok: boolean) =>
    ok ? <CheckCircle size={20} color={tokens.success} weight="fill" /> : <WarningCircle size={20} color={tokens.warning} weight="fill" />;
  const links = u ? SOCIALS.filter((s) => u[s.key]) : [];
  const copy = (label: string, value: string) => {
    void Clipboard.setStringAsync(value);
    AppAlert.alert(`${label} copied`, value);
  };

  return (
    <Shell title="User" loading={!u} error={error} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => router.push(`/apex/users/${id}/edit`)} label="Edit user">
                <PencilSimple size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      {u ? (
        <>
          <Hero imageUrl={u.avatarUrl} title={nameOf(u)} lines={[u.username ? `@${u.username}` : 'No username', `Joined ${shortDate(u.createdAt)}`]} />
          <Text style={[styles.bio, { color: u.bio ? tokens.textSecondary : tokens.textMuted }]}>{u.bio || 'No bio provided.'}</Text>

          <SettingsGroup title="Contact" plain>
            <InfoRow
              title={u.email ?? 'No email'}
              subtitle={u.email ? (u.emailVerified ? 'Email · verified' : 'Email · not verified') : undefined}
              trailing={u.email ? verifiedMark(u.emailVerified) : undefined}
              onPress={u.email ? () => void Linking.openURL(`mailto:${u.email}`) : undefined}
              onLongPress={u.email ? () => copy('Email', u.email!) : undefined}
            />
            <InfoRow
              title={u.mobileNumber ?? 'No mobile number'}
              subtitle={u.mobileNumber ? (u.mobileVerified ? 'Mobile · verified' : 'Mobile · not verified') : undefined}
              trailing={u.mobileNumber ? verifiedMark(u.mobileVerified) : undefined}
              onPress={u.mobileNumber ? () => void Linking.openURL(`tel:${u.mobileNumber}`) : undefined}
              onLongPress={u.mobileNumber ? () => copy('Mobile', u.mobileNumber!) : undefined}
            />
          </SettingsGroup>

          <SettingsGroup title="Reach out" plain>
            <SettingsRow
              label="Send a push notification"
              value={u.pushDevices && !u.pushDevices.some((d) => d.linkedAt && d.optedIn) ? 'No linked device' : undefined}
              onPress={() => router.push({ pathname: '/apex/push/new', params: { userId: u.id, name: nameOf(u) } })}
            />
          </SettingsGroup>

          <SettingsGroup title="Links" plain>
            {links.length === 0 ? <SettingsRow label="No links added" /> : null}
            {links.map((s) => (
              <SettingsRow key={s.key} label={s.label} value={hostOf(u[s.key]!)} external onPress={() => void Linking.openURL(u[s.key]!)} />
            ))}
          </SettingsGroup>

          <SettingsGroup title="App" plain>
            <InfoRow
              title={u.appVersion ? `v${u.appVersion}${u.appPlatform ? ` · ${platformLabel(u.appPlatform)}` : ''}` : 'Not reported yet'}
              subtitle={u.appVersionLastReportedAt ? `Last seen ${shortDate(u.appVersionLastReportedAt)}` : undefined}
            />
          </SettingsGroup>

          <SettingsGroup title={`Roles (${u.roles.length})`} plain>
            {u.roles.length === 0 ? <SettingsRow label="No roles assigned" /> : null}
            {u.roles.map((r) => (
              <InfoRow
                key={r.id}
                title={r.name}
                subtitle={[
                  r.spaceName ?? (r.scope === 'PLATFORM' ? 'Platform' : titleCase(r.scope)),
                  r.assignedBy ? `by ${nameOf(r.assignedBy)}` : null,
                  shortDate(r.assignedAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={r.spaceId ? () => router.push(`/apex/spaces/${r.spaceId}`) : undefined}
              />
            ))}
          </SettingsGroup>

          {u.pushDevices ? (
            <SettingsGroup title={`Push devices (${u.pushDevices.length})`} plain>
              {u.pushDevices.length === 0 ? <SettingsRow label="No devices registered" /> : null}
              {u.pushDevices.map((d) => (
                <InfoRow
                  key={d.id}
                  title={[d.deviceModel || 'Unknown device', platformLabel(d.platform), d.appVersion ? `v${d.appVersion}` : null].filter(Boolean).join(' · ')}
                  subtitle={[
                    d.linkedAt ? 'Linked' : 'Not linked',
                    d.optedIn ? 'push on' : 'push off',
                    `last seen ${shortDate(d.lastSeenAt)}`,
                  ].join(' · ')}
                  detail={!d.linkedAt && d.linkError ? `Link failed: ${d.linkError}` : d.subscriptionId}
                  detailDanger={!d.linkedAt && !!d.linkError}
                  trailing={
                    d.linkedAt && d.optedIn ? (
                      <CheckCircle size={20} color={tokens.success} weight="fill" />
                    ) : (
                      <WarningCircle size={20} color={tokens.warning} weight="fill" />
                    )
                  }
                  onLongPress={() => copy('Subscription id', d.subscriptionId)}
                />
              ))}
            </SettingsGroup>
          ) : null}

          <SettingsGroup title={`Sign-in methods (${u.identities.length})`} plain>
            {u.identities.length === 0 ? <SettingsRow label="No linked identities" /> : null}
            {u.identities.map((i) => (
              <InfoRow
                key={i.id}
                title={titleCase(i.provider)}
                subtitle={[i.email ?? '—', i.isPrimary ? 'primary' : null, i.emailVerified ? 'verified' : 'not verified'].filter(Boolean).join(' · ')}
                trailing={verifiedMark(i.emailVerified)}
              />
            ))}
          </SettingsGroup>
        </>
      ) : null}
    </Shell>
  );
}

const SOCIALS = [
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'instagramUrl', label: 'Instagram' },
  { key: 'githubUrl', label: 'GitHub' },
  { key: 'websiteUrl', label: 'Website' },
] as const;

const PLATFORM_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Web' };
const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? titleCase(p);
const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Two-line row (title + muted subtitle, optional third line) on a SettingsGroup card. */
function InfoRow({
  title,
  subtitle,
  detail,
  detailDanger,
  trailing,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  detailDanger?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const tokens = useTokens();
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: tokens.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text style={[styles.rowDetail, { color: detailDanger ? tokens.danger : tokens.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <CaretRight size={15} color={tokens.textMuted} /> : null)}
    </>
  );
  if (!onPress && !onLongPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]}
    >
      {body}
    </Pressable>
  );
}

// ── Space ────────────────────────────────────────────────────────────────────

export function SpaceDetailAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const load = useCallback(() => getSpaceDetail(id!), [id]);
  const { data: s, error, refreshing, refresh } = useRecord(load);
  const [events, setEvents] = useState<ManagedEvent[] | null>(null);
  const [children, setChildren] = useState<ChildSpace[]>([]);
  const [childPage, setChildPage] = useState({ page: 0, totalPages: 1, total: 0 });
  const [busy, setBusy] = useState<'approve' | 'reject' | 'status' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!id) return;
    getManagedSpaceEvents(id)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [id]);

  const loadChildren = useCallback(
    async (page: number) => {
      const res = await getChildSpaces(id!, page);
      if (!res.ok) return;
      setChildren((prev) => (page === 1 ? res.data.spaces : [...prev, ...res.data.spaces]));
      setChildPage({ page, totalPages: res.data.pagination?.totalPages ?? 1, total: res.data.pagination?.total ?? res.data.spaces.length });
    },
    [id],
  );
  useEffect(() => {
    if (s?.type === 'SUPER') void loadChildren(1);
  }, [s?.type, loadChildren]);

  const upcoming = (events ?? []).filter((e) => new Date(e.endDateTime ?? e.startDateTime) >= new Date());
  const past = (events ?? []).filter((e) => new Date(e.endDateTime ?? e.startDateTime) < new Date());

  const eventRow = (e: ManagedEvent) => (
    <SettingsRow key={e.id} label={e.title} value={`${titleCase(e.status)} · ${shortDate(e.startDateTime)}`} onPress={() => router.push(`/apex/events/${e.id}`)} />
  );

  const act = async (kind: 'approve' | 'reject' | 'status', run: () => Promise<Result<unknown>>) => {
    setBusy(kind);
    const res = await run();
    setBusy(null);
    if (!res.ok) return AppAlert.alert("Couldn't update", res.message);
    setRejecting(false);
    setNote('');
    await refresh();
  };

  const confirmApprove = () =>
    AppAlert.alert('Approve this space?', 'It goes live and its admins can start publishing events.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => void act('approve', () => approveSpace(id!)) },
    ]);

  const confirmReject = () =>
    AppAlert.alert('Reject this space?', 'The requester sees it was turned down, with your note.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void act('reject', () => rejectSpace(id!, note.trim() || undefined)) },
    ]);

  const pickStatus = () => {
    if (!s) return;
    AppAlert.alert('Lifecycle state', `Currently ${titleCase(s.status)}.`, [
      ...MANAGEABLE_SPACE_STATUSES.filter((st) => st !== s.status).map((st) => ({
        text: titleCase(st),
        style: st === 'SUSPENDED' || st === 'ARCHIVED' ? ('destructive' as const) : undefined,
        onPress: () => void act('status', () => updateSpaceStatus(id!, st)),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const statusColor = (st: string) =>
    st === 'ACTIVE' || st === 'APPROVED' ? tokens.success : st === 'PENDING' ? tokens.warning : st === 'REJECTED' || st === 'SUSPENDED' ? tokens.danger : tokens.textSecondary;

  return (
    <Shell title="Space" loading={!s} error={error} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => router.push(`/manage/space/${id}/settings`)} label="Edit space">
                <PencilSimple size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      {s ? (
        <>
          {s.bannerUrl ? <Image source={{ uri: s.bannerUrl }} style={styles.banner} /> : null}
          <Hero
            square
            imageUrl={s.logoUrl}
            title={s.name}
            lines={[`/${s.slug}`, [s.city, s.state].filter(Boolean).join(', ') || null]}
          />
          <Text style={[styles.status, { color: statusColor(s.status) }]}>
            {[titleCase(s.status), s.type === 'SUPER' ? 'Parent space' : 'Regular space', titleCase(s.visibility)].join(' · ')}
          </Text>
          <Text style={[styles.bio, { color: s.description ? tokens.textSecondary : tokens.textMuted }]}>{s.description || 'No description added yet.'}</Text>

          {s._count ? (
            <View style={{ marginTop: spacing[5] }}>
              <ManageStats
                stats={[
                  { label: 'People', value: s._count.userRoles },
                  { label: 'Events', value: s._count.events },
                  { label: 'Sub-spaces', value: s._count.childSpaces },
                ]}
              />
            </View>
          ) : null}

          {/* Admin controls: review while pending, lifecycle after. */}
          {s.status === 'PENDING' ? (
            rejecting ? (
              <>
                <SettingsGroup title="Why are you rejecting it?" plain>
                  <FieldRow stacked multiline label="Note (optional, they see this)" value={note} onChangeText={setNote} placeholder="e.g. We couldn't verify this organisation." autoFocus />
                </SettingsGroup>
                <Button label="Reject" variant="danger" size="lg" fullWidth loading={busy === 'reject'} onPress={confirmReject} style={{ marginTop: spacing[5] }} />
                <Button label="Back" variant="ghost" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(false)} style={{ marginTop: spacing[2] }} />
              </>
            ) : (
              <>
                <Text style={[styles.groupHint, { color: tokens.textMuted }]}>Awaiting review. Approve to make it live, or reject with a reason.</Text>
                <Button label="Approve" size="lg" fullWidth loading={busy === 'approve'} disabled={busy !== null} onPress={confirmApprove} style={{ marginTop: spacing[3] }} />
                <Button label="Reject" variant="danger" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(true)} style={{ marginTop: spacing[3] }} />
              </>
            )
          ) : (
            <SettingsGroup title="Admin controls" plain>
              <SettingsRow
                label="Lifecycle state"
                value={busy === 'status' ? 'Updating…' : titleCase(s.status)}
                onPress={s.status === 'REJECTED' || busy ? undefined : pickStatus}
              />
            </SettingsGroup>
          )}

          <SettingsGroup title="Manage" plain>
            <SettingsRow label="Edit details and branding" onPress={() => router.push(`/manage/space/${id}/settings`)} />
            <SettingsRow label="Members" value={s._count ? String(s._count.userRoles) : undefined} onPress={() => router.push(`/manage/space/${id}/members`)} />
            <SettingsRow label="Add member" onPress={() => router.push(`/manage/space/${id}/add-member`)} />
            <SettingsRow label="Hierarchy" value={s.type === 'SUPER' ? 'Parent space' : 'Regular'} onPress={() => router.push(`/apex/spaces/${id}/hierarchy`)} />
          </SettingsGroup>

          <SettingsGroup title="About" plain>
            <SettingsRow label="Owner" value={nameOf(s.creator)} onPress={s.creator ? () => router.push(`/apex/users/${s.creator!.id}`) : undefined} />
            {s.parentSpace ? <SettingsRow label="Parent" value={s.parentSpace.name} onPress={() => router.push(`/apex/spaces/${s.parentSpace!.id}`)} /> : null}
            {s.websiteUrl ? (
              <SettingsRow label="Website" value={s.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')} external onPress={() => void Linking.openURL(s.websiteUrl!)} />
            ) : null}
            {s.country ? <SettingsRow label="Country" value={s.country} /> : null}
            {s.tags?.length ? <SettingsRow label="Tags" value={s.tags.join(', ')} /> : null}
            {s.submittedAt ? <SettingsRow label="Submitted" value={longDate(s.submittedAt)} /> : null}
            {s.approvedAt ? <SettingsRow label="Approved" value={longDate(s.approvedAt)} /> : null}
            {s.rejectedAt ? <SettingsRow label="Rejected" value={longDate(s.rejectedAt)} /> : null}
            <SettingsRow label="Created" value={longDate(s.createdAt)} />
            <SettingsRow label="Last updated" value={longDate(s.updatedAt)} />
          </SettingsGroup>

          {s.organisers && s.organisers.length > 0 ? (
            <SettingsGroup title="Space admins" plain>
              {s.organisers.map((o) => (
                <SettingsRow key={o.id} label={nameOf(o.user)} value={o.role.name} onPress={() => router.push(`/apex/users/${o.user.id}`)} />
              ))}
            </SettingsGroup>
          ) : null}

          {s.type === 'SUPER' ? (
            <SettingsGroup title={`Child spaces (${childPage.total})`} plain>
              {children.length === 0 ? <SettingsRow label="No child spaces yet" /> : null}
              {children.map((c) => {
                const members = c._count?.userRoles ?? 0;
                return (
                  <SettingsRow
                    key={c.id}
                    label={c.name}
                    value={`${c.status && c.status !== 'ACTIVE' && c.status !== 'APPROVED' ? `${titleCase(c.status)} · ` : ''}${members} ${members === 1 ? 'member' : 'members'}`}
                    onPress={() => router.push(`/apex/spaces/${c.id}`)}
                  />
                );
              })}
              {childPage.page < childPage.totalPages ? <SettingsRow label="Show more" onPress={() => void loadChildren(childPage.page + 1)} /> : null}
            </SettingsGroup>
          ) : null}

          {events === null ? (
            <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[6] }} />
          ) : (
            <>
              {upcoming.length > 0 ? <SettingsGroup title="Upcoming and drafts" plain>{upcoming.map(eventRow)}</SettingsGroup> : null}
              {past.length > 0 ? <SettingsGroup title="Past" plain>{past.slice(0, 20).map(eventRow)}</SettingsGroup> : null}
            </>
          )}

          <SettingsGroup plain>
            <SettingsRow label="Delete space" danger onPress={() => router.push(`/apex/spaces/${id}/delete`)} />
          </SettingsGroup>
        </>
      ) : null}
    </Shell>
  );
}

// ── Event ────────────────────────────────────────────────────────────────────

export function EventDetailAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const load = useCallback(() => getAdminEvent(id!), [id]);
  const { data: e, error, refreshing, refresh } = useRecord(load);

  return (
    <Shell title="Event" loading={!e} error={error} refreshing={refreshing} onRefresh={refresh}>
      {e ? (
        <>
          {e.coverImageUrl ? <Image source={{ uri: e.coverImageUrl }} style={styles.banner} /> : null}
          <Text style={[styles.title, { color: tokens.text }]}>{e.title}</Text>
          <Text style={[styles.muted, { color: tokens.textMuted }]}>
            {[longDate(e.startDateTime), e.venueName || e.city].filter(Boolean).join('  ·  ')}
          </Text>
          <Text style={[styles.status, { color: e.deletedAt ? tokens.danger : tokens.textSecondary }]}>
            {e.deletedAt ? `Deleted · ${titleCase(e.status)}` : titleCase(e.status)}
          </Text>

          <View style={{ marginTop: spacing[5], gap: spacing[3] }}>
            <ManageStats
              stats={[
                { label: 'Attending', value: e.attendeeCount },
                { label: 'Bookings', value: e._count?.registrations ?? 0 },
              ]}
            />
            <ManageStats
              stats={[
                { label: 'Collected', value: inrShort(e.sales.grossSales) },
                { label: 'Refunded', value: inrShort(e.sales.refunded) },
              ]}
            />
          </View>

          <SettingsGroup title="About" plain>
            {e.space ? <SettingsRow label="Space" value={e.space.name} onPress={() => router.push(`/apex/spaces/${e.space!.id}`)} /> : null}
            {e.parentEvent ? <SettingsRow label="Part of" value={e.parentEvent.title} onPress={() => router.push(`/apex/events/${e.parentEvent!.id}`)} /> : null}
            <SettingsRow label="Created by" value={nameOf(e.creator)} onPress={e.creator ? () => router.push(`/apex/users/${e.creator!.id}`) : undefined} />
            {e.creator?.email ? <SettingsRow label="Email" value={e.creator.email} onPress={() => void Linking.openURL(`mailto:${e.creator!.email}`)} /> : null}
            {e.creator?.mobileNumber ? <SettingsRow label="Phone" value={e.creator.mobileNumber} onPress={() => void Linking.openURL(`tel:${e.creator!.mobileNumber}`)} /> : null}
            <SettingsRow label="App fees" value={inr(e.sales.processingFees)} />
          </SettingsGroup>

          {e.ticketTypes.length > 0 ? (
            <SettingsGroup title="Tickets" plain>
              {e.ticketTypes.map((t) => (
                <SettingsRow
                  key={t.id}
                  label={`${t.name} · ${Number(t.price) > 0 ? inr(t.price) : 'Free'}`}
                  value={`${t.soldCount}${t.quantity ? ` / ${t.quantity}` : ''}${t.sales.grossSales ? ` · ${inrShort(t.sales.grossSales)}` : ''}`}
                />
              ))}
            </SettingsGroup>
          ) : null}

          {e.childEvents.length > 0 ? (
            <SettingsGroup title="Sub-events" plain>
              {e.childEvents.map((c) => (
                <SettingsRow key={c.id} label={c.title} value={`${titleCase(c.status)} · ${shortDate(c.startDateTime)}`} onPress={() => router.push(`/apex/events/${c.id}`)} />
              ))}
            </SettingsGroup>
          ) : null}

          {e.recentRegistrations.length > 0 ? (
            <SettingsGroup title="Latest bookings" plain>
              {e.recentRegistrations.map((r) => (
                <SettingsRow
                  key={r.id}
                  label={nameOf(r.user)}
                  value={`${Number(r.totalAmount) > 0 ? inr(r.totalAmount) : 'Free'} · ${titleCase(r.status)} · ${shortDate(r.createdAt)}`}
                  onPress={r.user ? () => router.push(`/apex/users/${r.user!.id}`) : undefined}
                />
              ))}
            </SettingsGroup>
          ) : null}
        </>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  heroImg: { width: 64, height: 64, borderRadius: borderRadius.lg },
  banner: { width: '100%', aspectRatio: 4 / 3, borderRadius: borderRadius.xl, marginBottom: spacing[4] },
  title: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  status: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 56 },
  rowTitle: { fontSize: typography.fontSize.base, ...font('medium') },
  rowSub: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  rowDetail: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  groupHint: { marginTop: spacing[8], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  bio: { marginTop: spacing[4], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
