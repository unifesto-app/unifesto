import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { listMyTickets, type SupportTicket } from '../lib/api/support';
import TicketRow, { isActiveTicket } from '../components/support/TicketRow';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/** Support tickets raised for this space, open ones first, and a way to raise a new one. */
export default function SpaceSupportScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('SpaceSupport');

  const load = useCallback(async () => {
    const list = await listMyTickets(spaceId);
    setTickets([...list.filter(isActiveTicket), ...list.filter((t) => !isActiveTicket(t))]);
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

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={[styles.card, { backgroundColor: c.raised }]}>
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">Need a hand with this space?</Text>
        <Text style={[styles.body, { color: c.soft }]}>
          Payouts, plans, events or anything else. The Unifesto team replies right here.
        </Text>
        <AuthButton
          label="New request"
          arrow
          onPress={() => router.push({ pathname: '/manage/support/new', params: { spaceId } })}
          style={{ marginTop: spacing[5] }}
        />
      </View>

      <Section title="Requests" subtitle={tickets && tickets.length > 0 ? 'Open ones first' : undefined}>
        <View style={[styles.pad, styles.list]}>
          {tickets === null ? (
            [0, 1].map((i) => <Skeleton key={i} width="100%" height={76} borderRadius={cosmosCardRadius} />)
          ) : tickets.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: c.raised }]}>
              <Text style={[styles.emptyText, { color: c.soft }]}>Nothing raised yet.</Text>
            </View>
          ) : (
            tickets.map((t) => (
              <TicketRow key={t.id} ticket={t} showSpace={false} onPress={() => router.push(`/manage/support/${t.id}`)} />
            ))
          )}
        </View>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius, padding: spacing[5] },
  title: { fontSize: 18, lineHeight: 26, ...cosmosFont.display },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  list: { gap: spacing[3] },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
