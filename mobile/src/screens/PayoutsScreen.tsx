import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSpacePayouts, type Payout } from '../lib/api/finance';
import { getManagedSpaceEvents, type ManagedEvent } from '../lib/api/manageSpace';
import { PayoutRow } from '../components/manage/FinanceRows';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { relativeWhen } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

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
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
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
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const now = new Date();

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
      }
    >
      <Text style={[styles.intro, { color: tokens.textMuted }]}>
        Pick an event to pay out what it has earned so far. Unifesto sends the money by bank transfer and records the reference here.
      </Text>

      <SettingsGroup title="Request a payout" plain>
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

      <SettingsGroup plain title={`History${payouts.length ? ` · ${payouts.length}` : ''}`}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
