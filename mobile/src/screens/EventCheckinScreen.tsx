import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Lifebuoy, MagnifyingGlass, QrCode } from '@unifesto/unicon/react-native';
import { useCheckinEvent } from '../hooks/useCheckinEvent';
import { useCheckinHub } from '../hooks/useCheckinHub';
import { useOfflineCheckin } from '../hooks/useOfflineCheckin';
import { useIsOffline } from '../lib/offline/connectivity';
import { offlineStats, pullChanges } from '../lib/offline/checkinQueue';
import { undoCheckin, type RecentCheckin } from '../lib/api/checkin';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import CheckinProgressCard from '../components/checkin/CheckinProgressCard';
import OfflineCheckinPanel from '../components/checkin/OfflineCheckinPanel';
import PersonRow from '../components/checkin/PersonRow';
import PointChips from '../components/checkin/PointChips';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { getHelpInbox } from '../lib/api/hackathon';
import { Button } from '../components/ui';
import { relativeWhen } from '../utils/eventFormat';
import { checkinPhase, timeAgo } from '../utils/checkinFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';
import { CardBackdrop } from '../components/ui/CardSurface';

/**
 * One event's door: live progress, the two ways to check people in, and the
 * latest arrivals. With several check-in points the numbers can be narrowed to
 * one, and the chosen point carries into the scanner and search.
 */
export default function EventCheckinScreen() {
  const router = useRouter();
  const c = useCosmos();
  const params = useLocalSearchParams<{ eventId: string; title?: string; startDateTime?: string; venueName?: string }>();
  const { eventId } = params;

  const { event, points } = useCheckinEvent(eventId);
  const [pointId, setPointId] = useState('');
  const hub = useCheckinHub(eventId, pointId);
  const offline = useOfflineCheckin(eventId);
  const isOffline = useIsOffline();
  // No signal: counts come from the saved list + queued scans.
  const localStats = isOffline && offline.store ? offlineStats(offline.store, pointId || undefined) : null;
  const stats = localStats ?? hub.stats;

  // Hackathon help desk: open queries sent to me (null = no hackathon / not staff).
  const [openQueries, setOpenQueries] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!eventId) return;
      void getHelpInbox(eventId).then((r) =>
        setOpenQueries(r.ok && r.data ? r.data.queries.filter((q) => q.status !== 'RESOLVED').length : null),
      );
    }, [eventId]),
  );

  const title = event?.title ?? params.title ?? 'Event';
  const start = event?.startDateTime ?? params.startDateTime;
  const venue = event?.venueName || event?.city || params.venueName;
  const live = event ? checkinPhase(event) === 'live' : false;
  const activePoint = points.find((p) => p.id === pointId);

  // Recent rows carry the point by name, so narrow them the same way as the stats.
  const recent = useMemo(
    () => (hub.recent ?? []).filter((r) => !activePoint || r.checkinType === activePoint.name),
    [hub.recent, activePoint],
  );

  const [undoingId, setUndoingId] = useState<string | null>(null);
  const undo = (r: RecentCheckin) => {
    if (!r.checkinTypeId || undoingId) return;
    const at = r.checkinType ? ` at ${r.checkinType}` : '';
    AppAlert.alert(`Undo ${r.attendeeName}'s check-in${at}?`, 'They can be scanned in again afterwards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo check-in',
        style: 'destructive',
        onPress: async () => {
          setUndoingId(r.id);
          try {
            await undoCheckin(r.registrationId, r.checkinTypeId!, r.memberIndex);
            hub.refresh();
            if (offline.store) void pullChanges(offline.store);
          } catch (e) {
            AppAlert.alert("Couldn't undo", e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setUndoingId(null);
          }
        },
      },
    ]);
  };

  // A single-point event goes straight in; with several, pass the chip choice
  // (or none, and the scanner asks).
  const toolParams = { checkinTypeId: pointId || (points.length === 1 ? points[0].id : '') };

  return (
    <CosmosScreen refreshing={hub.refreshing} onRefresh={hub.refresh}>
      {/* Identity */}
      <View style={styles.gutter}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={3} accessibilityRole="header">
          {title}
        </Text>
        {live || start || venue ? (
          <View style={styles.metaRow}>
            {live ? <View style={[styles.liveDot, { backgroundColor: c.mint }]} /> : null}
            <Text style={[styles.meta, { color: live ? c.mint : c.muted }]} numberOfLines={1}>
              {live ? 'Live now' : start ? relativeWhen(start) : ''}
              <Text style={{ color: c.muted }}>{venue ? `${live || start ? ' · ' : ''}${venue}` : ''}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      {points.length > 1 ? (
        <View style={styles.chips}>
          <PointChips points={points} value={pointId} onChange={setPointId} allowAll inset={GUTTER} />
        </View>
      ) : null}

      {/* Progress */}
      <View style={[styles.gutter, { marginTop: spacing[5] }]}>
        {hub.error && !stats ? (
          <View style={styles.errorBox}>
            <CardBackdrop shape={styles.errorBox} />
            <Text style={[styles.errorText, { color: c.soft }]}>{hub.error}</Text>
            <Button label="Try again" variant="secondary" onPress={hub.retry} style={{ alignSelf: 'center' }} />
          </View>
        ) : (
          <CheckinProgressCard stats={stats} loading={hub.loading && !localStats} />
        )}
      </View>

      {/* Actions */}
      <View style={[styles.gutter, styles.actions]}>
        <Button
          label="Scan tickets"
          size="lg"
          fullWidth
          icon={<QrCode size={22} color={c.primaryFg} weight="bold" />}
          onPress={() => router.push({ pathname: `/checkin/${eventId}/scanner`, params: toolParams })}
        />
        <Button
          label="Find an attendee"
          variant="secondary"
          size="lg"
          fullWidth
          icon={<MagnifyingGlass size={20} color={c.text} weight="bold" />}
          onPress={() => router.push({ pathname: `/checkin/${eventId}/manual`, params: toolParams })}
        />
      </View>

      {openQueries !== null ? (
        <View style={styles.gutter}>
          <SettingsGroup title="Unifesto Sprint">
            <SettingsRow
              icon={<Lifebuoy size={24} color={c.text} />}
              label="Help desk"
              value={openQueries ? `${openQueries} open` : 'All clear'}
              onPress={() => router.push(`/hackathon/${eventId}/help-desk`)}
            />
          </SettingsGroup>
        </View>
      ) : null}

      {/* Saved guest list + sync queue */}
      <View style={styles.gutter}>
        <OfflineCheckinPanel offline={offline} />
      </View>

      {/* Latest arrivals */}
      <View style={styles.gutter}>
        <SettingsGroup title={activePoint ? `Recent at ${activePoint.name}` : 'Recent check-ins'}>
          {hub.recent === null ? (
            <Text style={[styles.placeholder, { color: c.muted }]}>Loading…</Text>
          ) : recent.length === 0 ? (
            <Text style={[styles.placeholder, { color: c.muted }]}>
              No one yet. Scan a ticket or search for someone to get started.
            </Text>
          ) : (
            recent.map((r) => (
              <PersonRow
                key={r.id}
                name={r.attendeeName}
                sub={[activePoint ? null : r.checkinType, r.checkedBy ? `by ${r.checkedBy}` : null, r.ticketType]
                  .filter(Boolean)
                  .join(' · ')}
                aside={timeAgo(r.checkedInAt)}
                undo={!isOffline && r.checkinTypeId ? { busy: undoingId === r.id, onPress: () => undo(r) } : undefined}
              />
            ))
          )}
        </SettingsGroup>
      </View>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: GUTTER },
  title: { fontSize: typography.fontSize['3xl'], lineHeight: 34, ...cosmosFont.display, letterSpacing: displayTracking(28) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  meta: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  chips: { marginTop: spacing[5] },
  errorBox: { gap: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  errorText: { textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  actions: { gap: spacing[3], marginTop: spacing[5] },
  placeholder: { fontSize: typography.fontSize.sm, padding: spacing[4], lineHeight: 20, ...cosmosFont.body },
});
