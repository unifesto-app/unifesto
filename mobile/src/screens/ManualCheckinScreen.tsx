import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MagnifyingGlass, UserFocus, XCircle } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { CheckinNetworkError, manualCheckin, searchAttendees, undoCheckin, type AttendeeSearchResult } from '../lib/api/checkin';
import { useCheckinEvent } from '../hooks/useCheckinEvent';
import { useOfflineCheckin } from '../hooks/useOfflineCheckin';
import { isOnline, useIsOffline } from '../lib/offline/connectivity';
import { enqueueCheckin, findEntry, offlineSearch, pullChanges, recordLiveCheckin } from '../lib/offline/checkinQueue';
import useTopSpacing from '../hooks/useTopSpacing';
import PersonRow from '../components/checkin/PersonRow';
import PointChips from '../components/checkin/PointChips';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GroupCell } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { attendeeName } from '../utils/checkinFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[5];
const MIN_QUERY = 2;

/**
 * Find someone without a QR (dead phone, forgotten ticket) and check them in
 * right from the result row. Stays on the list afterwards: the next person in
 * line is usually also waiting.
 */
export default function ManualCheckinScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { eventId, checkinTypeId } = useLocalSearchParams<{ eventId: string; checkinTypeId?: string }>();
  const { points, loading: pointsLoading } = useCheckinEvent(eventId);
  const offline = useOfflineCheckin(eventId);
  const store = offline.store;
  const isOffline = useIsOffline();

  const [pointId, setPointId] = useState(checkinTypeId ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AttendeeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // A group's members share a registration, so rows are keyed per member.
  const rowKey = (r: AttendeeSearchResult) => `${r.registrationId}:${r.memberIndex ?? ''}`;
  const seq = useRef(0);

  // Default to the first point once they're known (a route param wins).
  useEffect(() => {
    if (!pointId && points.length > 0) setPointId(points[0].id);
  }, [points, pointId]);

  // Debounced search; re-runs on point change so "Checked in" reflects that point.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY || !pointId) {
      seq.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    // Offline: search the saved guest list by name or ticket code instead.
    const local = () => (store ? offlineSearch(store, q, pointId) : []);
    const t = setTimeout(async () => {
      try {
        const { results } = isOnline() ? await searchAttendees(eventId, q, pointId) : { results: local() };
        if (mine === seq.current) setResults(results);
      } catch (e) {
        if (mine === seq.current) setResults(e instanceof CheckinNetworkError ? local() : []);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // offline.pending: re-run so queued check-ins show as "Checked in".
  }, [query, eventId, pointId, store, offline.pending]);

  const checkIn = useCallback(
    async (r: AttendeeSearchResult) => {
      if (busyId || !pointId) return;
      if (r.claimable === false) {
        AppAlert.alert('Seat not claimed yet', 'Nobody has claimed this seat, so there is no one to check in.');
        return;
      }
      const key = rowKey(r);
      const member = r.memberIndex ?? null;
      setBusyId(key);

      const queue = async () => {
        const entry = store ? findEntry(store, r.registrationId) : undefined;
        if (!entry) throw new Error("You're offline and this person isn't on the saved guest list.");
        if (entry.blockedReason) throw new Error(entry.blockedReason);
        await enqueueCheckin(store!, entry, pointId, member != null ? [member] : undefined);
        Vibration.vibrate(30);
      };

      try {
        if (!isOnline()) {
          await queue();
          return;
        }
        const res = await manualCheckin(r.registrationId, pointId, member);
        if (store) {
          recordLiveCheckin(
            store,
            { registrationId: r.registrationId },
            pointId,
            member != null ? null : res.checkedInAt,
            member != null ? [member] : undefined,
          );
        }
        setResults((prev) =>
          prev.map((x) =>
            rowKey(x) === key ? { ...x, checkedInAtPoint: res.checkedInAt ?? new Date().toISOString() } : x,
          ),
        );
        Vibration.vibrate(30);
        if (res.alreadyCheckedIn) {
          AppAlert.alert('Already checked in', `${attendeeName(res.attendee ?? r.attendee)} was already in at this point.`);
        }
      } catch (e) {
        try {
          if (e instanceof CheckinNetworkError) {
            await queue();
            return;
          }
          throw e;
        } catch (err) {
          AppAlert.alert("Couldn't check in", err instanceof Error ? err.message : 'Please try again.');
        }
      } finally {
        setBusyId(null);
      }
    },
    [busyId, pointId, store],
  );

  const undo = useCallback(
    (r: AttendeeSearchResult) => {
      if (busyId || !pointId) return;
      const name = attendeeName(r.attendee);
      AppAlert.alert(`Undo ${name}'s check-in?`, 'They can be checked in again afterwards.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo check-in',
          style: 'destructive',
          onPress: async () => {
            const key = rowKey(r);
            setBusyId(key);
            try {
              await undoCheckin(r.registrationId, pointId, r.memberIndex);
              setResults((prev) => prev.map((x) => (rowKey(x) === key ? { ...x, checkedInAtPoint: null } : x)));
              if (store) void pullChanges(store);
            } catch (e) {
              AppAlert.alert("Couldn't undo", e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [busyId, pointId, store],
  );

  const q = query.trim();
  const noPoint = !pointsLoading && points.length === 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.search}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name, email, phone or ticket ID"
          placeholderTextColor={tokens.textMuted}
          style={[styles.input, { color: tokens.text }]}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
        />
        {searching ? (
          <ActivityIndicator size="small" color={tokens.textMuted} />
        ) : query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <XCircle size={20} color={tokens.textMuted} weight="fill" />
          </Pressable>
        ) : null}
      </View>
      {points.length > 1 ? (
        <View style={styles.chips}>
          <PointChips points={points} value={pointId} onChange={setPointId} inset={GUTTER} />
        </View>
      ) : null}
    </View>
  );

  const emptyState = noPoint ? (
    <Empty title="No check-in access" body="Ask a curator to give you access to a check-in point for this event." />
  ) : q.length < MIN_QUERY ? (
    <Empty title="Search the guest list" body="Type at least two letters. Group members can be found by their own name too." />
  ) : searching ? null : (
    <Empty title="No one found" body={`Nobody on this event matches "${q}".`} />
  );

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      data={results}
      keyExtractor={rowKey}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyState}
      renderItem={({ item, index }) => (
        <GroupCell index={index} count={results.length} style={styles.cell} divider={styles.divider}>
          <ResultRow item={item} busy={busyId === rowKey(item)} canUndo={!isOffline} onCheckIn={checkIn} onUndo={undo} />
        </GroupCell>
      )}
    />
  );
}

const ResultRow = React.memo(function ResultRow({ item, busy, canUndo, onCheckIn, onUndo }: {
  item: AttendeeSearchResult;
  busy: boolean;
  canUndo: boolean;
  onCheckIn: (r: AttendeeSearchResult) => Promise<void>;
  onUndo: (r: AttendeeSearchResult) => void;
}) {
  return (
    <PersonRow
      name={attendeeName(item.attendee)}
      avatarUrl={item.attendee.avatarUrl}
      sub={[
        item.ticketType,
        item.groupLeadName && item.memberIndex !== 0 ? `${item.groupLeadName}'s group` : null,
        item.memberIndex === 0 ? 'Group lead' : null,
        item.claimable === false ? 'Seat not claimed' : null,
        item.attendee.username && item.attendee.fullName ? `@${item.attendee.username}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      action={{
        state: item.checkedInAtPoint ? 'done' : busy ? 'busy' : 'idle',
        onPress: () => void onCheckIn(item),
      }}
      undo={item.checkedInAtPoint && canUndo ? { busy, onPress: () => onUndo(item) } : undefined}
    />
  );
});

function Empty({ title, body }: { title: string; body: string }) {
  const tokens = useTokens();
  return (
    <View style={styles.empty}>
      <UserFocus size={44} color={tokens.textMuted} />
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing[12] },
  header: { marginBottom: spacing[4] },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: GUTTER,
    paddingHorizontal: spacing[4],
    height: 52,
    borderRadius: borderRadius.full,
  },
  input: { flex: 1, fontSize: typography.fontSize.base, paddingVertical: 0, ...font() },
  chips: { marginTop: spacing[3] },
  cell: { marginHorizontal: GUTTER },
  divider: { marginLeft: spacing[4] + 40 + spacing[3] },
  empty: { alignItems: 'center', paddingTop: spacing[16], paddingHorizontal: spacing[8], gap: spacing[2] },
  emptyTitle: { fontSize: typography.fontSize.lg, marginTop: spacing[2], ...font('semibold') },
  emptyBody: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, ...font() },
});
