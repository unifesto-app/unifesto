import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { QrCode } from '@unifesto/unicon/react-native';
import { getMyCheckinEvents, type CheckinEvent } from '../lib/api/checkin';
import CheckinEventCard from '../components/checkin/CheckinEventCard';
import Skeleton from '../components/Skeleton';
import { Button } from '../components/ui';
import { checkinPhase, type CheckinPhase } from '../utils/checkinFormat';
import useTopSpacing from '../hooks/useTopSpacing';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[5];
const ENDED_SHOWN = 5;

const SECTIONS: { phase: CheckinPhase; title: string }[] = [
  { phase: 'live', title: 'Live now' },
  { phase: 'upcoming', title: 'Coming up' },
  { phase: 'ended', title: 'Recently ended' },
];

/** Every event this user can check people into, bucketed live → upcoming → ended. */
export default function CheckinListScreen() {
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();

  const [events, setEvents] = useState<CheckinEvent[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const { events } = await getMyCheckinEvents();
      setEvents(events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your events');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const now = new Date();
    const out: Record<CheckinPhase, CheckinEvent[]> = { live: [], upcoming: [], ended: [] };
    for (const ev of events ?? []) out[checkinPhase(ev, now)].push(ev);
    const byStart = (a: CheckinEvent, b: CheckinEvent) =>
      new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
    out.live.sort(byStart);
    out.upcoming.sort(byStart);
    out.ended.sort((a, b) => -byStart(a, b));
    out.ended = out.ended.slice(0, ENDED_SHOWN);
    return out;
  }, [events]);

  const open = (ev: CheckinEvent) =>
    router.push({
      pathname: `/checkin/${ev.id}`,
      params: { title: ev.title, startDateTime: ev.startDateTime, venueName: ev.venueName || ev.city || '' },
    });

  const empty = events !== null && events.length === 0;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }, empty && styles.grow]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={c.primary}
          colors={[c.primary]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {events === null && !error ? (
        <View style={styles.list}>
          <Skeleton width={90} height={16} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} borderRadius={borderRadius.xl} />
          ))}
        </View>
      ) : error && !events ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Couldn't load events</Text>
          <Text style={[styles.emptyText, { color: c.muted }]}>{error}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
        </View>
      ) : empty ? (
        <View style={styles.center}>
          <QrCode size={48} color={c.muted} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>Nothing to check in yet</Text>
          <Text style={[styles.emptyText, { color: c.muted }]}>
            Events you run, or where a curator gives you door access, show up here.
          </Text>
        </View>
      ) : (
        SECTIONS.map(({ phase, title }) =>
          grouped[phase].length > 0 ? (
            <View key={phase} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.muted }]}>{title}</Text>
              <View style={styles.list}>
                {grouped[phase].map((ev) => (
                  <CheckinEventCard key={ev.id} event={ev} phase={phase} onPress={() => open(ev)} />
                ))}
              </View>
            </View>
          ) : null,
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[12] },
  grow: { flexGrow: 1 },
  section: { marginBottom: spacing[8] },
  sectionTitle: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], marginLeft: spacing[1], ...cosmosFont.strong },
  list: { gap: spacing[3] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingBottom: spacing[20] },
  emptyTitle: { fontSize: typography.fontSize.xl, marginTop: spacing[3], textAlign: 'center', ...cosmosFont.display },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, maxWidth: 290, ...cosmosFont.body },
});
