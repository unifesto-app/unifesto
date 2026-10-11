import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { QrCode } from '@unifesto/unicon/react-native';
import type { UpcomingTicket } from '../../hooks/useHomeData';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { GUTTER } from './Section';
import { countdownLabel, relativeWhen } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import PressableScale from '../ui/PressableScale';

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
  const c = useCosmos();
  const defaults = useDefaultImages();
  const venue = ticket.venueName || ticket.city || (ticket.type === 'ONLINE' ? 'Online' : 'Venue TBA');

  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.soft }]}>Up next</Text>
        {moreCount > 0 ? (
          <PressableScale
            feedback="inline"
            onPress={onSeeAllTickets}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`See all my tickets, ${moreCount} more`}
          >
            <Text style={[styles.more, { color: c.soft }]}>+{moreCount} more</Text>
          </PressableScale>
        ) : null}
      </View>

      <PressableScale
        onPress={onOpenTicket}
        accessibilityRole="button"
        accessibilityLabel={`Open ticket for ${ticket.title}`}
        style={[
          styles.card,
        ]}
      >
        <CardBackdrop shape={styles.card} />
        <View style={styles.main}>
          <View style={[styles.thumb, { backgroundColor: c.card }]}>
            {coverOr(defaults, ticket.id, ticket.coverImageUrl) ? (
              <Image source={{ uri: coverOr(defaults, ticket.id, ticket.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[styles.badge, { backgroundColor: c.tint }]}>
              <View style={[styles.badgeDot, { backgroundColor: c.primary }]} />
              <Text style={[styles.badgeText, { color: c.primary }]}>{countdownLabel(ticket.startDateTime)}</Text>
            </View>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{ticket.title}</Text>
          </View>
        </View>

        {/* Perforation between stub and body, with notches cut into both edges */}
        <View style={styles.perfRow}>
          <View style={[styles.notch, styles.notchLeft, { backgroundColor: c.bg }]} />
          <View style={[styles.perf, { borderColor: c.border }]} />
          <View style={[styles.notch, styles.notchRight, { backgroundColor: c.bg }]} />
        </View>

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.when, { color: c.text }]}>{relativeWhen(ticket.startDateTime)}</Text>
            <Text style={[styles.venue, { color: c.muted }]} numberOfLines={1}>{venue}</Text>
          </View>
          <View style={[styles.qr, { backgroundColor: c.primary }]}>
            <QrCode size={16} color={c.primaryFg} weight="bold" />
            <Text style={[styles.qrText, { color: c.primaryFg }]}>Ticket</Text>
          </View>
        </View>
      </PressableScale>
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
      <View style={styles.card}>
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
          <Skeleton width={92} height={38} borderRadius={cosmosRadius} />
        </View>
      </View>
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  more: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
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
  badgeText: { fontSize: 12, ...cosmosFont.strong },
  title: { fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.25, ...cosmosFont.strong },
  perfRow: { height: NOTCH, justifyContent: 'center' },
  perf: { marginHorizontal: NOTCH, borderTopWidth: 1, borderStyle: 'dashed' },
  notch: { position: 'absolute', width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], paddingTop: spacing[2] },
  when: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  venue: { fontSize: typography.fontSize.sm, marginTop: 2, ...cosmosFont.body },
  qr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: cosmosRadius,
  },
  qrText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
