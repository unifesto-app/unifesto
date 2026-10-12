import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSpacePayouts, type Payout } from '../lib/api/finance';
import { getManagedSpaceEvents, type ManagedEvent } from '../lib/api/manageSpace';
import { PayoutRow } from '../components/manage/FinanceRows';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { relativeWhen } from '../utils/eventFormat';
import CosmosScreen from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * Any event that has earned money can be drawn down, ended or not. Paid is
 * read from ticket prices because the event's `isFree` flag goes stale.
 */
function requestable(e: ManagedEvent) {
  return e.status !== 'DRAFT' && e.status !== 'CANCELLED' && !e.isCoHost && (e.ticketTypes ?? []).some((t) => Number(t.price) > 0);
}

/** Request a payout for an event, and every payout this space has had. */
export default function PayoutsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [events, setEvents] = useState<ManagedEvent[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  useAnalyticsScreenTracking('Payouts');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const gen = ++generation.current;
    const [ev, po] = await Promise.all([getManagedSpaceEvents(spaceId).catch(() => null), getSpacePayouts(spaceId)]);
    if (gen !== generation.current) return;
    if (!po.ok) setError(po.denied ? 'Only Space admins can see payouts.' : po.message);
    else {
      setError('');
      setPayouts(po.data);
    }
    setEvents(ev ? ev.filter(requestable).sort((a, b) => +new Date(b.startDateTime) - +new Date(a.startDateTime)) : []);
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!events) {
    return (
      <CosmosScreen>
        <View style={styles.pad}>
          <Skeleton width="100%" height={40} borderRadius={8} />
          <Skeleton width="100%" height={168} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
          <Skeleton width="100%" height={220} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
        </View>
      </CosmosScreen>
    );
  }

  const now = new Date();

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={[styles.intro, { color: c.soft }]}>
        Pick an event to pay out what it has earned so far. Unifesto sends the money by bank transfer and records the reference here.
      </Text>

      <Section title="Request a payout" style={styles.firstSection}>
        <SettingsGroup plain style={styles.group}>
          {events.length === 0 ? (
            <SettingsRow label="No paid events yet" />
          ) : (
            events.map((e) => (
              <SettingsRow
                key={e.id}
                label={e.title}
                value={new Date(e.endDateTime) < now ? 'Ended' : relativeWhen(e.startDateTime, now)}
                onPress={() => router.push({ pathname: `/manage/event/${e.id}/payout`, params: { title: e.title } })}
              />
            ))
          )}
        </SettingsGroup>
      </Section>

      <Section title="History" subtitle={payouts.length ? `${payouts.length} payout${payouts.length === 1 ? '' : 's'}` : undefined}>
        <SettingsGroup plain style={styles.group}>
          {error ? (
            <SettingsRow label={error} />
          ) : payouts.length === 0 ? (
            <SettingsRow label="No payouts yet" />
          ) : (
            payouts.map((p) => (
              <PayoutRow
                key={p.id}
                payout={p}
                inCard
                detail={p.failureReason ? { text: p.failureReason, danger: true } : p.utr ? { text: `Reference ${p.utr}` } : null}
              />
            ))
          )}
        </SettingsGroup>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  intro: { paddingHorizontal: GUTTER, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  firstSection: { marginTop: spacing[8] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
});
