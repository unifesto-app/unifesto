import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams } from 'expo-router';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
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
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

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

/**
 * The waiting list per ticket: let the next few in, let a specific person in,
 * or revoke an offer someone never paid for (offers don't expire on their own).
 */
export default function WaitlistScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [summary, setSummary] = useState<WaitlistSummaryRow[] | null>(null);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [ticketId, setTicketId] = useState('');
  const [view, setView] = useState<View_>('active');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useAnalyticsScreenTracking('Waitlist');

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
  const act = async <T,>(key: string, fn: () => Promise<Result<T>>, done: (data: T) => string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't do that", res.message);
      return;
    }
    AppAlert.alert(done(res.data));
    await load();
  };

  const nameOf = (e: WaitlistEntry) => e.user.fullName || e.user.username || 'They';

  const allow = (e: WaitlistEntry) =>
    void act(e.registrationId, () => letIn(eventId!, e.registrationId), (d) =>
      d.needsPayment
        ? `${nameOf(e)} is let in. Their seat is held until they pay ₹${d.amountDue ?? ''}. Revoke it if they never do.`
        : `${nameOf(e)} is confirmed. The ticket is free, so there was nothing to pay.`,
    );

  const revoke = (e: WaitlistEntry) =>
    AppAlert.alert(`Revoke the offer for ${nameOf(e)}?`, 'Their held seat goes back to the pool. This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () => void act(e.registrationId, () => revokeOffer(eventId!, e.registrationId), () => 'Offer revoked. The seat is free again.'),
      },
    ]);

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
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const enabled = summary.filter((s) => s.waitlistEnabled);

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
      {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}

      {enabled.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>
          No ticket has a waiting list. Turn it on for a ticket with a capacity under Tickets.
        </Text>
      ) : (
        <View style={styles.cards}>
          {enabled.map((row) => (
            <View key={row.ticketTypeId} style={styles.card}>
              <CardBackdrop shape={styles.card} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={[styles.cardSub, { color: tokens.textMuted }]}>
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

      <SettingsGroup>
        {entries.length === 0 ? <SettingsRow label="Nobody here" /> : null}
        {entries.map((e) => {
          const offered = e.waitlistStatus === 'OFFERED';
          const waiting = e.waitlistStatus === 'WAITING';
          return (
            <View key={e.registrationId} style={styles.entry}>
              <Text style={[styles.pos, { color: tokens.textMuted }]}>{waiting ? `#${e.position}` : ''}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
                  {nameOf(e)}
                </Text>
                <Text style={[styles.cardSub, { color: offered ? tokens.warning : tokens.textMuted }]} numberOfLines={1}>
                  {[
                    e.ticketType?.name,
                    e.seats > 1 ? `${e.seats} seats` : '',
                    offered ? `offered ${since(e.offeredAt)}${e.amountDue ? `, owes ₹${e.amountDue}` : ''}` : `joined ${since(e.joinedAt)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {busy === e.registrationId ? (
                <ActivityIndicator size="small" color={tokens.accent} />
              ) : waiting ? (
                <Pressable onPress={() => allow(e)} hitSlop={8}>
                  <Text style={[styles.link, { color: tokens.accent }]}>Let in</Text>
                </Pressable>
              ) : offered ? (
                <Pressable onPress={() => revoke(e)} hitSlop={8}>
                  <Text style={[styles.link, { color: tokens.danger }]}>Revoke</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  empty: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  cards: { gap: spacing[3] },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4] },
  cardTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  cardSub: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 60 },
  pos: { width: 28, fontSize: typography.fontSize.sm, ...font('semibold') },
  name: { fontSize: typography.fontSize.base, ...font('medium') },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
