import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useEventTicketTypes } from '../hooks/useEventTicketTypes';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import TicketTypeRow from '../components/manage/TicketTypeRow';
import { Button } from '../components/ui';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const COPY = {
  tickets: {
    intro: 'Paid and group tickets. Each can have its own price, capacity and limit.',
    empty: 'No tickets yet. Add one to start taking registrations.',
    add: 'Add ticket',
  },
  rsvps: {
    intro: 'One-click, free registration. No payment, no form.',
    empty: 'No RSVP options yet.',
    add: 'Add RSVP',
  },
} as const;

/** Lists an event's tickets or RSVPs (by `mode`) and opens the editor. */
export default function TicketTypesScreen({ mode }: { mode: 'tickets' | 'rsvps' }) {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const t = useEventTicketTypes(eventId);
  const copy = COPY[mode];
  const list = mode === 'tickets' ? t.tickets : t.rsvps;

  useAnalyticsScreenTracking(mode === 'tickets' ? 'ManageTickets' : 'ManageRsvps');

  const open = (ticketId: string) =>
    router.push({
      pathname: `/manage/event/${eventId}/ticket/${ticketId}`,
      params: ticketId === 'new' ? { kind: mode === 'rsvps' ? 'RSVP' : 'INDIVIDUAL' } : {},
    });

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={t.refreshing} onRefresh={t.refresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
      }
    >
      <Text style={[styles.intro, { color: tokens.textMuted }]}>{copy.intro}</Text>

      <View style={styles.list}>
        {t.loading ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[8] }} />
        ) : t.error ? (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>{t.error}</Text>
        ) : list.length === 0 ? (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>{copy.empty}</Text>
        ) : (
          list.map((ticket) => <TicketTypeRow key={ticket.id} ticket={ticket} onPress={() => open(ticket.id)} />)
        )}
      </View>

      <Button
        label={copy.add}
        size="lg"
        fullWidth
        icon={<Plus size={18} color={tokens.accentFg} weight="bold" />}
        onPress={() => open('new')}
        style={{ marginTop: spacing[6] }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  intro: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  list: { marginTop: spacing[5], gap: spacing[3] },
  empty: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
