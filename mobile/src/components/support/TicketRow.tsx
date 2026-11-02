import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRight } from '@unifesto/unicon/react-native';
import { CATEGORY_LABEL, KIND_LABEL, STATUS_LABEL, type SupportTicket } from '../../lib/api/support';
import { Badge, type BadgeTone } from '../ui/Badge';
import Skeleton from '../Skeleton';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const isActiveTicket = (t: SupportTicket) => t.status === 'BOT' || t.status === 'OPEN' || t.status === 'PENDING';

/**
 * One case as a row on the page (inside a flat SettingsGroup, which draws the
 * hairlines): a sky dot when there's news, the subject and its status as plain
 * text, then #number · kind (category for help) · space · last activity.
 */
export default function TicketRow({ ticket, onPress, showSpace = true }: { ticket: SupportTicket; onPress: () => void; showSpace?: boolean }) {
  const c = useCosmos();
  const active = isActiveTicket(ticket);
  // Waiting on me reads loudest (amber); resolved gets the done tick; the rest stay muted.
  const tone: BadgeTone = ticket.status === 'PENDING' ? 'warning' : ticket.status === 'RESOLVED' ? 'success' : 'neutral';
  const about = ticket.kind && ticket.kind !== 'HELP' ? KIND_LABEL[ticket.kind] : CATEGORY_LABEL[ticket.category];
  const meta = [`#${ticket.ticketNumber}`, about, showSpace ? ticket.space?.name : null, day(ticket.lastMessageAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}, ${STATUS_LABEL[ticket.status]}${ticket.unread ? ', new reply' : ''}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.info, !active && { opacity: 0.62 }]}>
        <View style={styles.subjectRow}>
          {ticket.unread && <View style={[styles.unreadDot, { backgroundColor: c.sky }]} />}
          <Text style={[styles.subject, { color: c.text }]} numberOfLines={1}>{ticket.subject}</Text>
          <Badge label={STATUS_LABEL[ticket.status]} tone={tone} style={styles.status} />
        </View>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>{meta}</Text>
      </View>
      <CaretRight size={15} color={c.muted} />
    </Pressable>
  );
}

export function TicketRowSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton width="70%" height={15} borderRadius={6} />
      <Skeleton width="45%" height={12} borderRadius={6} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], minHeight: 56 },
  skeleton: { justifyContent: 'center', gap: 8, paddingVertical: spacing[3], minHeight: 56 },
  info: { flex: 1, gap: 4 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  subject: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  status: { alignSelf: 'center' },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
