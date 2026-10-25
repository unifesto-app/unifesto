import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams } from 'expo-router';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  getWaitlist,
  getWaitlistSummary,
  letIn,
  letInNext,
  revokeOffer,
  type WaitlistEntry,
  type WaitlistStatus,
  type WaitlistSummaryRow,
} from '../lib/api/waitlist';
import type { Result } from '../lib/api/manageEvent';
import ChipPicker from '../components/manage/ChipPicker';
import { GroupCell, SettingsGroupHeader, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];

type View_ = 'active' | 'CONVERTED' | 'EXPIRED' | 'DECLINED';
const VIEWS: { value: View_; label: string }[] = [
  { value: 'active', label: 'In line' },
  { value: 'CONVERTED', label: 'Got in' },
  { value: 'EXPIRED', label: 'Revoked' },
  { value: 'DECLINED', label: 'Left' },
];

const since = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

const nameOf = (e: WaitlistEntry) => e.user.fullName || e.user.username || 'They';

/**
 * The waiting list per ticket: let the next few in, let a specific person in,
 * or revoke an offer someone never paid for (offers don't expire on their own).
 */
export default function WaitlistScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [summary, setSummary] = useState<WaitlistSummaryRow[] | null>(null);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [ticketId, setTicketId] = useState('');
  const [view, setView] = useState<View_>('active');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const [s, l] = await Promise.all([
      getWaitlistSummary(eventId),
      getWaitlist(eventId, { ticketTypeId: ticketId || undefined, status: view === 'active' ? undefined : (view as WaitlistStatus) }),
    ]);
    if (s.ok) setSummary(s.data);
    else {
      setError(s.denied ? "You can't manage this waiting list." : s.message);
      setSummary((x) => x ?? []);
    }
    if (l.ok) setEntries(l.data.data);
  }, [eventId, ticketId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run one write, report the outcome, reload. */
  const act = useCallback(
    async <T,>(key: string, fn: () => Promise<Result<T>>, done: (data: T) => string) => {
      setBusy(key);
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        AppAlert.alert("Couldn't do that", res.message);
        return;
      }
      AppAlert.alert(done(res.data));
      await load();
    },
    [load],
  );

  const allow = useCallback(
    (e: WaitlistEntry) =>
      void act(e.registrationId, () => letIn(eventId!, e.registrationId), (d) =>
        d.needsPayment
          ? `${nameOf(e)} is let in. Their seat is held until they pay ₹${d.amountDue ?? ''}. Revoke it if they never do.`
          : `${nameOf(e)} is confirmed. The ticket is free, so there was nothing to pay.`,
      ),
    [act, eventId],
  );

  const revoke = useCallback(
    (e: WaitlistEntry) =>
      AppAlert.alert(`Revoke the offer for ${nameOf(e)}?`, 'Their held seat goes back to the pool. This cannot be undone.', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => void act(e.registrationId, () => revokeOffer(eventId!, e.registrationId), () => 'Offer revoked. The seat is free again.'),
        },
      ]),
    [act, eventId],
  );

  const next = (row: WaitlistSummaryRow) => {
    const options = [1, 5, 10].filter((n) => n <= Math.max(1, row.waiting));
    AppAlert.alert(`Let people in from ${row.name}`, `${row.waiting} waiting${row.seatsAvailable != null ? `, ${row.seatsAvailable} seats free` : ''}.`, [
      ...options.map((n) => ({
        text: n === 1 ? 'Next person' : `Next ${n}`,
        onPress: () =>
          void act(row.ticketTypeId, () => letInNext(eventId!, row.ticketTypeId, n), (d) =>
            d.offeredCount < d.requested
              ? `Let in ${d.offeredCount} of ${d.requested}. The rest didn't fit in the free seats.`
              : `Let in ${d.offeredCount}.`,
          ),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (!summary) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const enabled = summary.filter((s) => s.waitlistEnabled);

  const header = (
    <>
      {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}

      {enabled.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>
          No ticket has a waiting list. Turn it on for a ticket with a capacity under Tickets.
        </Text>
      ) : (
        <View style={styles.cards}>
          {enabled.map((row) => (
            <View key={row.ticketTypeId} style={styles.card}>
              <CardBackdrop shape={styles.card} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={[styles.cardSub, { color: c.muted }]}>
                  {row.waiting} waiting · {row.offered} offered
                  {row.seatsAvailable != null ? ` · ${row.seatsAvailable} free` : ''}
                </Text>
              </View>
              <Button
                label="Let in"
                size="sm"
                variant="secondary"
                disabled={row.waiting === 0 || row.seatsAvailable === 0}
                loading={busy === row.ticketTypeId}
                onPress={() => next(row)}
              />
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: spacing[6] }}>
        <ChipPicker options={VIEWS} value={view} onChange={(v) => v && setView(v)} />
      </View>
      {enabled.length > 1 ? (
        <View style={{ marginTop: spacing[2] }}>
          <ChipPicker
            options={enabled.map((r) => ({ value: r.ticketTypeId, label: r.name }))}
            value={ticketId}
            onChange={setTicketId}
            clearable
          />
        </View>
      ) : null}

      <SettingsGroupHeader />
    </>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
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
          tintColor={c.primary}
          colors={[c.primary]}
          progressViewOffset={topSpacing}
        />
      }
      data={entries}
      keyExtractor={(e) => e.registrationId}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <GroupCell index={0} count={1}>
          <SettingsRow label="Nobody here" />
        </GroupCell>
      }
      renderItem={({ item, index }) => (
        <GroupCell index={index} count={entries.length}>
          <EntryRow e={item} busy={busy === item.registrationId} onAllow={allow} onRevoke={revoke} />
        </GroupCell>
      )}
    />
  );
}

const EntryRow = React.memo(function EntryRow({ e, busy, onAllow, onRevoke }: {
  e: WaitlistEntry;
  busy: boolean;
  onAllow: (e: WaitlistEntry) => void;
  onRevoke: (e: WaitlistEntry) => void;
}) {
  const c = useCosmos();
  const offered = e.waitlistStatus === 'OFFERED';
  const waiting = e.waitlistStatus === 'WAITING';
  return (
    <View style={styles.entry}>
      <Text style={[styles.pos, { color: c.muted }]}>{waiting ? `#${e.position}` : ''}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {nameOf(e)}
        </Text>
        <Text style={[styles.cardSub, { color: offered ? c.warn : c.muted }]} numberOfLines={1}>
          {[
            e.ticketType?.name,
            e.seats > 1 ? `${e.seats} seats` : '',
            offered ? `offered ${since(e.offeredAt)}${e.amountDue ? `, owes ₹${e.amountDue}` : ''}` : `joined ${since(e.joinedAt)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={c.primary} />
      ) : waiting ? (
        <Pressable onPress={() => onAllow(e)} hitSlop={8}>
          <Text style={[styles.link, { color: c.primary }]}>Let in</Text>
        </Pressable>
      ) : offered ? (
        <Pressable onPress={() => onRevoke(e)} hitSlop={8}>
          <Text style={[styles.link, { color: c.danger }]}>Revoke</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  empty: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  cards: { gap: spacing[3] },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4] },
  cardTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  cardSub: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 60 },
  pos: { width: 28, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  link: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
