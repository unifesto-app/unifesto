import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MagnifyingGlass, Plus } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { getManagedSpaceEvents, type ManagedEvent } from '../lib/api/manageSpace';
import {
  acceptAttach,
  attachSubEvent,
  cancelAttach,
  declineAttach,
  detachSubEvent,
  getAttachRequests,
  getSubEvents,
  requestAttach,
  type AttachRequest,
  type SubEventRow,
} from '../lib/api/hierarchy';
import type { Result } from '../lib/api/manageEvent';
import type { Event } from '../lib/api/events';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A big event and its sub-events. Nest events from this space straight away,
 * ask the owner of a co-hosted event to nest it, answer requests from others,
 * or create a new sub-event. A sub-event can own sub-events too (depth 3, server-checked).
 */
export default function SubEventsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();

  const [event, setEvent] = useState<Event | null>(null);
  const [subs, setSubs] = useState<SubEventRow[]>([]);
  const [spaceEvents, setSpaceEvents] = useState<ManagedEvent[]>([]);
  const [requests, setRequests] = useState<{ incoming: AttachRequest[]; outgoing: AttachRequest[] }>({ incoming: [], outgoing: [] });
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useAnalyticsScreenTracking('SubEvents');

  const load = useCallback(async () => {
    if (!eventId) return;
    const ev = await getManagedEvent(eventId);
    if (!ev.ok) {
      setError(ev.message);
      return;
    }
    setEvent(ev.data);
    const [s, r, list] = await Promise.all([
      getSubEvents(eventId),
      getAttachRequests(eventId),
      getManagedSpaceEvents(ev.data.spaceId).catch(() => [] as ManagedEvent[]),
    ]);
    if (s.ok) setSubs(s.data);
    if (r.ok) setRequests(r.data);
    setSpaceEvents(list);
    setError('');
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pendingChildIds = useMemo(() => new Set(requests.outgoing.map((r) => r.childEvent.id)), [requests.outgoing]);
  const subIds = useMemo(() => new Set(subs.map((s) => s.id)), [subs]);
  // Same rules as the web picker; the server re-checks depth and ownership.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return spaceEvents
      .filter(
        (e) =>
          e.id !== eventId &&
          !subIds.has(e.id) &&
          !e.parentEventId &&
          (e._count?.childEvents ?? 0) === 0 &&
          !pendingChildIds.has(e.id) &&
          e.title.toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [spaceEvents, query, eventId, subIds, pendingChildIds]);

  const act = async (key: string, fn: () => Promise<Result<unknown>>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't do that", res.message);
      return false;
    }
    await load();
    return true;
  };

  const add = (e: ManagedEvent) =>
    e.isCoHost
      ? AppAlert.alert(`Ask to nest "${e.title}"?`, 'Another space owns it, so they have to accept first.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send request', onPress: () => void act(e.id, () => requestAttach(eventId!, e.id)).then((ok) => ok && setQuery('')) },
        ])
      : void act(e.id, () => attachSubEvent(eventId!, e.id)).then((ok) => ok && setQuery(''));

  const detach = (s: SubEventRow) =>
    AppAlert.alert(`Remove "${s.title}" as a sub-event?`, 'It stays as its own event.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void act(s.id, () => detachSubEvent(eventId!, s.id)) },
    ]);

  const leaveParent = () =>
    AppAlert.alert('Detach from the main event?', 'This event stays, it just stops being part of it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Detach', style: 'destructive', onPress: () => void act('self', () => detachSubEvent(event!.parentEventId!, eventId!)) },
    ]);

  if (!event) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const isChild = !!event.parentEventId;
  const nameOf = (r: AttachRequest) => r.requester.fullName || r.requester.username || 'Someone';

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      keyboardShouldPersistTaps="handled"
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
      {/* A sub-event can still own sub-events (the server caps depth at 3), so
          the "Part of" block sits above the management UI instead of replacing it. */}
      {isChild ? (
        <View style={{ marginBottom: spacing[6] }}>
          <SettingsGroup title="Part of">
            <SettingsRow
              label={event.parentEvent?.title ?? 'Main event'}
              onPress={() => router.push(`/manage/event/${event.parentEventId}`)}
            />
          </SettingsGroup>
          <Button
            label="Detach from it"
            variant="danger"
            fullWidth
            loading={busy === 'self'}
            onPress={leaveParent}
            style={{ marginTop: spacing[4] }}
          />
        </View>
      ) : null}
      <Text style={[styles.intro, { color: tokens.textSecondary }]}>
        {subs.length === 0
          ? 'Group events under this one, like the talks inside a festival. People register for each sub-event on its own.'
          : (event.ticketTypes?.length ?? 0) > 0
            ? 'This event sells its own tickets, so it works as a full pass alongside its sub-events.'
            : "This event has no tickets of its own, so it's an umbrella and people register per sub-event."}
      </Text>

      {requests.incoming.length > 0 ? (
        <SettingsGroup title="Asking to nest this event">
          {requests.incoming.map((r) => (
            <View key={r.id} style={styles.request}>
              <Text style={[styles.reqTitle, { color: tokens.text }]}>
                Under {r.parentEvent.title} ({r.parentEvent.space.name})
              </Text>
              <Text style={[styles.reqSub, { color: tokens.textMuted }]}>
                From {nameOf(r)}
                {r.reason ? `: “${r.reason}”` : ''}
              </Text>
              <View style={styles.reqActions}>
                <Button label="Accept" size="sm" loading={busy === `a:${r.id}`} onPress={() => void act(`a:${r.id}`, () => acceptAttach(eventId!, r.id))} />
                <Button label="Decline" size="sm" variant="secondary" loading={busy === `d:${r.id}`} onPress={() => void act(`d:${r.id}`, () => declineAttach(eventId!, r.id))} />
              </View>
            </View>
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={`Sub-events · ${subs.length}`}>
        {subs.length === 0 ? <SettingsRow label="None yet" /> : null}
        {subs.map((s) => (
          <SettingsRow
            key={s.id}
            label={s.title}
            value={s.status === 'DRAFT' ? 'Draft' : day(s.startDateTime)}
            trailing={
              busy === s.id ? (
                <ActivityIndicator size="small" color={tokens.danger} />
              ) : (
                <Pressable onPress={() => detach(s)} hitSlop={8}>
                  <Text style={[styles.link, { color: tokens.danger }]}>Remove</Text>
                </Pressable>
              )
            }
            onPress={() => router.push(`/manage/event/${s.id}`)}
          />
        ))}
        {requests.outgoing.map((r) => (
          <SettingsRow
            key={r.id}
            label={r.childEvent.title}
            value="Awaiting owner"
            trailing={
              <Pressable onPress={() => void act(`c:${r.id}`, () => cancelAttach(eventId!, r.id))} hitSlop={8}>
                <Text style={[styles.link, { color: tokens.danger }]}>Withdraw</Text>
              </Pressable>
            }
          />
        ))}
      </SettingsGroup>

      <Button
        label="New sub-event"
        variant="secondary"
        fullWidth
        icon={<Plus size={18} color={tokens.text} weight="bold" />}
        onPress={() =>
          router.push({ pathname: `/manage/space/${event.spaceId}/new-event`, params: { parentId: eventId, parentTitle: event.title } })
        }
        style={{ marginTop: spacing[5] }}
      />

      <View style={[styles.search, { marginTop: spacing[8] }]}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Nest an existing event"
          placeholderTextColor={tokens.textMuted}
          selectionColor={tokens.accent}
          autoCorrect={false}
          style={[styles.searchInput, { color: tokens.text }]}
        />
      </View>
      {query.trim().length >= 2 ? (
        <SettingsGroup>
          {candidates.length === 0 ? <SettingsRow label="No events to nest" /> : null}
          {candidates.map((e) => (
            <SettingsRow
              key={e.id}
              label={e.title}
              value={e.isCoHost ? 'Co-hosted' : undefined}
              trailing={
                busy === e.id ? (
                  <ActivityIndicator size="small" color={tokens.accent} />
                ) : (
                  <Text style={[styles.link, { color: tokens.accent }]}>{e.isCoHost ? 'Request' : 'Add'}</Text>
                )
              }
              onPress={busy ? undefined : () => add(e)}
            />
          ))}
        </SettingsGroup>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
  request: { padding: spacing[4], gap: spacing[1] },
  reqTitle: { fontSize: typography.fontSize.base, ...font('medium') },
  reqSub: { fontSize: typography.fontSize.xs, ...font() },
  reqActions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  searchInput: { flex: 1, fontSize: typography.fontSize.base, ...font() },
});
