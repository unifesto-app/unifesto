import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
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
  const [reordering, setReordering] = useState(false);

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
      <View style={styles.introRow}>
        <Text style={[styles.intro, { color: tokens.textMuted }]}>{copy.intro}</Text>
        {list.length > 1 ? (
          <Pressable onPress={() => setReordering((r) => !r)} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.action, { color: tokens.accent }]}>{reordering ? 'Done' : 'Reorder'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.list}>
        {t.loading ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[8] }} />
        ) : t.error ? (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>{t.error}</Text>
        ) : list.length === 0 ? (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>{copy.empty}</Text>
        ) : (
          list.map((ticket, i) => (
            <TicketTypeRow
              key={ticket.id}
              ticket={ticket}
              reordering={reordering}
              onPress={() => open(ticket.id)}
              onMoveUp={i > 0 ? () => void t.move(list, ticket.id, -1) : undefined}
              onMoveDown={i < list.length - 1 ? () => void t.move(list, ticket.id, 1) : undefined}
            />
          ))
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
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4] },
  intro: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  action: { fontSize: typography.fontSize.sm, ...font('semibold') },
  list: { marginTop: spacing[5], gap: spacing[3] },
  empty: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
