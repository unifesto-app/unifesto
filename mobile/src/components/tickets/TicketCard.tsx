import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, QrCode, UsersThree, XCircle } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import type { MyTicket } from '../../hooks/useMyTickets';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { countdownLabel, dateChip, formatTime } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';

// Event banners are 4:3.
const THUMB_W = 84;
const THUMB_H = 63;
const STUB_W = 64;
const NOTCH = 16;

type Status =
  | { kind: 'countdown'; label: string }
  | { kind: 'checkedIn' }
  | { kind: 'cancelled' }
  | { kind: 'ended' };

function statusOf(ticket: MyTicket): Status {
  if (ticket.registrationStatus === 'CANCELLED') return { kind: 'cancelled' };
  if (ticket.registrationStatus === 'ATTENDED') return { kind: 'checkedIn' };
  if (new Date(ticket.startDateTime) < new Date()) return { kind: 'ended' };
  return { kind: 'countdown', label: countdownLabel(ticket.startDateTime) };
}

/**
 * A pass: 4:3 event thumb and details on the left, a perforated tear line,
 * and a date stub on the right. Past and cancelled passes fade back so the
 * live ones stand out.
 */
export default function TicketCard({ ticket, onPress }: { ticket: MyTicket; onPress: () => void }) {
  const tokens = useTokens();
  const defaults = useDefaultImages();
  const status = statusOf(ticket);
  const live = status.kind === 'countdown';
  const chip = dateChip(ticket.startDateTime);
  const venue = ticket.venueName || ticket.city || (ticket.type === 'ONLINE' ? 'Online' : 'Venue TBA');
  const typeName = typeof ticket.ticketType === 'string' ? ticket.ticketType : ticket.ticketType?.name;

  const badge = (() => {
    switch (status.kind) {
      case 'countdown':
        return { text: status.label, color: tokens.accent, bg: 'rgba(52,145,255,0.14)', icon: null };
      case 'checkedIn':
        return { text: 'Checked in', color: tokens.success, bg: 'rgba(16,185,129,0.14)', icon: <CheckCircle size={11} color={tokens.success} weight="fill" /> };
      case 'cancelled':
        return { text: 'Cancelled', color: tokens.danger, bg: 'rgba(239,68,68,0.14)', icon: <XCircle size={11} color={tokens.danger} weight="fill" /> };
      default:
        return { text: 'Ended', color: tokens.textMuted, bg: tokens.fill, icon: null };
    }
  })();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ticket for ${ticket.title}`}
      style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <CardBackdrop shape={styles.card} />
      <View style={[styles.main, !live && { opacity: 0.62 }]}>
        <View style={[styles.thumb, { backgroundColor: tokens.surface }]}>
          {coverOr(defaults, ticket.id, ticket.coverImageUrl) ? (
            <Image source={{ uri: coverOr(defaults, ticket.id, ticket.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
        </View>

        <View style={styles.info}>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            {badge.icon}
            <Text style={[styles.badgeText, { color: badge.color }]} numberOfLines={1}>{badge.text}</Text>
          </View>
          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{ticket.title}</Text>
          <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
            {formatTime(new Date(ticket.startDateTime))} · {venue}
          </Text>
          {ticket.isGroupMember ? (
            <View style={styles.groupRow}>
              <UsersThree size={12} color={tokens.textMuted} weight="fill" />
              <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
                In {ticket.leadName ? `${ticket.leadName}'s` : 'a'} group
              </Text>
            </View>
          ) : typeName ? (
            <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>{typeName}</Text>
          ) : null}
        </View>
      </View>

      {/* Tear line with notches bitten out of the top and bottom edges */}
      <View style={styles.perfColumn}>
        <View style={[styles.notch, styles.notchTop, { backgroundColor: tokens.bg }]} />
        <View style={[styles.perf, { borderColor: tokens.border }]} />
        <View style={[styles.notch, styles.notchBottom, { backgroundColor: tokens.bg }]} />
      </View>

      <View style={[styles.stub, !live && { opacity: 0.62 }]}>
        <Text style={[styles.stubDay, { color: live ? tokens.text : tokens.textSecondary }]}>{chip.day}</Text>
        <Text style={[styles.stubMonth, { color: live ? tokens.accent : tokens.textMuted }]}>{chip.month}</Text>
        {live ? <QrCode size={18} color={tokens.textSecondary} style={{ marginTop: 8 }} /> : null}
      </View>
    </Pressable>
  );
}

export function TicketCardSkeleton() {
  return (
    <View style={[styles.card]}>
      <CardBackdrop shape={styles.card} />
      <View style={styles.main}>
        <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.md} />
        <View style={[styles.info, { gap: 8 }]}>
          <Skeleton width={70} height={14} borderRadius={7} />
          <Skeleton width="90%" height={14} borderRadius={6} />
          <Skeleton width="60%" height={12} borderRadius={6} />
        </View>
      </View>
      <View style={styles.stub}>
        <Skeleton width={28} height={22} borderRadius={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: borderRadius.xl, overflow: 'hidden' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  info: { flex: 1, gap: 3 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginBottom: 2,
  },
  badgeText: { fontSize: 11, ...font('semibold') },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...font('semibold') },
  meta: { fontSize: typography.fontSize.xs, ...font() },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  perfColumn: { width: 1, alignItems: 'center' },
  perf: { flex: 1, borderLeftWidth: 1, borderStyle: 'dashed', marginVertical: NOTCH / 2 + 2 },
  notch: { position: 'absolute', width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchTop: { top: -NOTCH / 2 },
  notchBottom: { bottom: -NOTCH / 2 },
  stub: { width: STUB_W, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[3] },
  stubDay: { fontSize: 26, lineHeight: 28, ...font('heading') },
  stubMonth: { fontSize: 12, ...font('semibold') },
});
