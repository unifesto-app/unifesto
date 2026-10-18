import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRight } from '@unifesto/unicon/react-native';
import { CATEGORY_LABEL, STATUS_LABEL, type SupportTicket } from '../../lib/api/support';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const isActiveTicket = (t: SupportTicket) => t.status === 'OPEN' || t.status === 'PENDING';

/** One request: subject, its status, then #number · category · space · last activity. */
export default function TicketRow({ ticket, onPress, showSpace = true }: { ticket: SupportTicket; onPress: () => void; showSpace?: boolean }) {
  const c = useCosmos();
  const active = isActiveTicket(ticket);
  // Waiting on me reads loudest; anything finished steps back.
  const waitingOnMe = ticket.status === 'PENDING';
  const meta = [`#${ticket.ticketNumber}`, CATEGORY_LABEL[ticket.category], showSpace ? ticket.space?.name : null, day(ticket.lastMessageAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}, ${STATUS_LABEL[ticket.status]}${ticket.unread ? ', new reply' : ''}`}
      style={({ pressed }) => [styles.ticket, { backgroundColor: c.raised, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <View style={[styles.info, !active && { opacity: 0.62 }]}>
        <View style={styles.subjectRow}>
          {ticket.unread && <View style={[styles.unreadDot, { backgroundColor: c.primary }]} />}
          <Text style={[styles.subject, { color: c.text }]} numberOfLines={1}>{ticket.subject}</Text>
          <View style={[styles.status, { backgroundColor: waitingOnMe ? c.primary : c.tint }]}>
            <Text style={[styles.statusText, { color: waitingOnMe ? c.primaryFg : c.text }]}>{STATUS_LABEL[ticket.status]}</Text>
          </View>
        </View>
        <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>{meta}</Text>
      </View>
      <CaretRight size={16} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ticket: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: cosmosCardRadius },
  info: { flex: 1, gap: 4 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  subject: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 11, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
