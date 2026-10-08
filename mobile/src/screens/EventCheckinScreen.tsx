import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Lifebuoy, MagnifyingGlass, QrCode } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useCheckinEvent } from '../hooks/useCheckinEvent';
import { useCheckinHub } from '../hooks/useCheckinHub';
import { useOfflineCheckin } from '../hooks/useOfflineCheckin';
import { useIsOffline } from '../lib/offline/connectivity';
import { offlineStats } from '../lib/offline/checkinQueue';
import useTopSpacing from '../hooks/useTopSpacing';
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
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[5];

/**
 * One event's door: live progress, the two ways to check people in, and the
 * latest arrivals. With several check-in points the numbers can be narrowed to
 * one, and the chosen point carries into the scanner and search.
 */
export default function EventCheckinScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
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

  // A single-point event goes straight in; with several, pass the chip choice
  // (or none, and the scanner asks).
  const toolParams = { checkinTypeId: pointId || (points.length === 1 ? points[0].id : '') };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={hub.refreshing}
          onRefresh={hub.refresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {/* Identity */}
      <View style={styles.gutter}>
        {live ? (
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, { backgroundColor: tokens.success }]} />
            <Text style={[styles.eyebrow, { color: tokens.success }]}>Live now</Text>
          </View>
        ) : start ? (
          <Text style={[styles.eyebrow, { color: tokens.accent }]}>{relativeWhen(start)}</Text>
        ) : null}
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={3}>
          {title}
        </Text>
        {venue ? (
          <Text style={[styles.venue, { color: tokens.textMuted }]} numberOfLines={1}>
            {venue}
          </Text>
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
            <Text style={[styles.venue, { color: tokens.textMuted }]}>{hub.error}</Text>
            <Button label="Try again" variant="secondary" size="sm" onPress={hub.retry} />
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
          icon={<QrCode size={22} color={tokens.accentFg} weight="bold" />}
          onPress={() => router.push({ pathname: `/checkin/${eventId}/scanner`, params: toolParams })}
        />
        <Button
          label="Find an attendee"
          variant="secondary"
          size="lg"
          fullWidth
          icon={<MagnifyingGlass size={20} color={tokens.text} weight="bold" />}
          onPress={() => router.push({ pathname: `/checkin/${eventId}/manual`, params: toolParams })}
        />
      </View>

      {openQueries !== null ? (
        <View style={styles.gutter}>
          <SettingsGroup title="Unifesto Sprint">
            <SettingsRow
              icon={<Lifebuoy size={24} color={tokens.accent} weight="fill" />}
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
            <Text style={[styles.placeholder, { color: tokens.textMuted }]}>Loading…</Text>
          ) : recent.length === 0 ? (
            <Text style={[styles.placeholder, { color: tokens.textMuted }]}>
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
              />
            ))
          )}
        </SettingsGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing[12] },
  gutter: { paddingHorizontal: GUTTER },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  eyebrow: { fontSize: typography.fontSize.sm, ...font('semibold') },
  title: { fontSize: typography.fontSize['3xl'], lineHeight: 36, marginTop: spacing[1], letterSpacing: -0.5, ...font('heading') },
  venue: { fontSize: typography.fontSize.sm, marginTop: spacing[1], ...font() },
  chips: { marginTop: spacing[5] },
  errorBox: { alignItems: 'flex-start', gap: spacing[3], paddingVertical: spacing[4] },
  actions: { gap: spacing[3], marginTop: spacing[5] },
  placeholder: { fontSize: typography.fontSize.sm, padding: spacing[4], lineHeight: 20, ...font() },
});
