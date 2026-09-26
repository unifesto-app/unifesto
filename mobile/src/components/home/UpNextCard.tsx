import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { QrCode } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import type { UpcomingTicket } from '../../hooks/useHomeData';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import Skeleton from '../Skeleton';
import { GUTTER } from './Section';
import { countdownLabel, relativeWhen } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';

interface UpNextCardProps {
  ticket: UpcomingTicket;
  moreCount: number;
  onOpenTicket: () => void;
  onSeeAllTickets: () => void;
}

/**
 * The next thing you're going to. Styled as a ticket stub (notched edges,
 * perforation) so it reads as "your pass" at a glance, one tap from the QR.
 */
export default function UpNextCard({ ticket, moreCount, onOpenTicket, onSeeAllTickets }: UpNextCardProps) {
  const tokens = useTokens();
  const venue = ticket.venueName || ticket.city || (ticket.type === 'ONLINE' ? 'Online' : 'Venue TBA');

  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: tokens.textSecondary }]}>Up next</Text>
        {moreCount > 0 ? (
          <Pressable onPress={onSeeAllTickets} hitSlop={10}>
            <Text style={[styles.more, { color: tokens.textSecondary }]}>+{moreCount} more</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onOpenTicket}
        accessibilityRole="button"
        accessibilityLabel={`Open ticket for ${ticket.title}`}
        style={({ pressed }) => [
          styles.card,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
      >
        <CardBackdrop shape={styles.card} />
        <View style={styles.main}>
          <View style={[styles.thumb, { backgroundColor: tokens.surface }]}>
            {ticket.coverImageUrl ? (
              <Image source={{ uri: ticket.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={tokens.accentGradient} style={StyleSheet.absoluteFill} />
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[styles.badge, { backgroundColor: 'rgba(52,145,255,0.14)' }]}>
              <View style={[styles.badgeDot, { backgroundColor: tokens.accent }]} />
              <Text style={[styles.badgeText, { color: tokens.accent }]}>{countdownLabel(ticket.startDateTime)}</Text>
            </View>
            <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{ticket.title}</Text>
          </View>
        </View>

        {/* Perforation between stub and body, with notches cut into both edges */}
        <View style={styles.perfRow}>
          <View style={[styles.notch, styles.notchLeft, { backgroundColor: tokens.bg }]} />
          <View style={[styles.perf, { borderColor: tokens.border }]} />
          <View style={[styles.notch, styles.notchRight, { backgroundColor: tokens.bg }]} />
        </View>

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.when, { color: tokens.text }]}>{relativeWhen(ticket.startDateTime)}</Text>
            <Text style={[styles.venue, { color: tokens.textMuted }]} numberOfLines={1}>{venue}</Text>
          </View>
          <View style={[styles.qr, { backgroundColor: tokens.text }]}>
            <QrCode size={16} color={tokens.bg} weight="bold" />
            <Text style={[styles.qrText, { color: tokens.bg }]}>Ticket</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

/** Placeholder with the same label row, stub, perforation and footer heights. */
export function UpNextCardSkeleton() {
  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.labelRow}>
        <Skeleton width={56} height={14} borderRadius={6} />
      </View>
      <View style={[styles.card]}>
        <CardBackdrop shape={styles.card} />
        <View style={styles.main}>
          <Skeleton width={76} height={57} borderRadius={borderRadius.md} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={84} height={20} borderRadius={borderRadius.full} />
            <Skeleton width="80%" height={16} borderRadius={6} />
          </View>
        </View>
        <View style={styles.perfRow} />
        <View style={styles.footer}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="45%" height={14} borderRadius={6} />
            <Skeleton width="60%" height={12} borderRadius={6} />
          </View>
          <Skeleton width={92} height={38} borderRadius={borderRadius.full} />
        </View>
      </View>
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  label: { fontSize: typography.fontSize.sm, ...font('semibold') },
  more: { fontSize: typography.fontSize.sm, ...font('medium') },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  main: { flexDirection: 'row', gap: spacing[4], padding: spacing[4], alignItems: 'center' },
  // Event banners are 4:3.
  thumb: { width: 76, height: 57, borderRadius: borderRadius.md, overflow: 'hidden' },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, ...font('semibold') },
  title: { fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.25, ...font('heading') },
  perfRow: { height: NOTCH, justifyContent: 'center' },
  perf: { marginHorizontal: NOTCH, borderTopWidth: 1, borderStyle: 'dashed' },
  notch: { position: 'absolute', width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], paddingTop: spacing[2] },
  when: { fontSize: typography.fontSize.base, ...font('semibold') },
  venue: { fontSize: typography.fontSize.sm, marginTop: 2, ...font() },
  qr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: borderRadius.full,
  },
  qrText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
