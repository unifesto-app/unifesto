import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QrCode } from '@unifesto/unicon/react-native';
import { getMyCheckinEvents, type CheckinEvent } from '../lib/api/checkin';
import CheckinEventCard from '../components/checkin/CheckinEventCard';
import Skeleton from '../components/Skeleton';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER, Section } from '../components/home/Section';
import { checkinPhase, type CheckinPhase } from '../utils/checkinFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
  const shown = SECTIONS.filter(({ phase }) => grouped[phase].length > 0);

  return (
    <CosmosScreen
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {events === null && !error ? (
        <View style={[styles.pad, styles.list]}>
          <Skeleton width={90} height={16} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} borderRadius={cosmosCardRadius} />
          ))}
        </View>
      ) : error && !events ? (
        <View style={styles.pad}>
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">Couldn't load events</Text>
            <Text style={[styles.emptyText, { color: c.muted }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4], alignSelf: 'center' }} />
          </View>
        </View>
      ) : empty ? (
        <View style={styles.pad}>
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <QrCode size={40} color={c.muted} />
            <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">Nothing to check in yet</Text>
            <Text style={[styles.emptyText, { color: c.muted }]}>
              Events you run, or where a curator gives you door access, show up here.
            </Text>
          </View>
        </View>
      ) : (
        shown.map(({ phase, title }, i) => (
          <Section key={phase} title={title} style={i === 0 ? styles.firstSection : undefined}>
            <View style={[styles.pad, styles.list]}>
              {grouped[phase].map((ev) => (
                <CheckinEventCard key={ev.id} event={ev} phase={phase} onPress={() => open(ev)} />
              ))}
            </View>
          </Section>
        ))
      )}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  firstSection: { marginTop: spacing[2] },
  list: { gap: spacing[3] },
  empty: { alignItems: 'center', gap: spacing[2], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyTitle: { fontSize: typography.fontSize.xl, lineHeight: 28, marginTop: spacing[2], textAlign: 'center', ...cosmosFont.display },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20, maxWidth: 290, ...cosmosFont.body },
});
