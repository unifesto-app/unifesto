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
import ShadeCard from '../ui/ShadeCard';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import PressableScale from '../ui/PressableScale';

interface UpNextCardProps {
  ticket: UpcomingTicket;
  moreCount: number;
  onOpenTicket: () => void;
  onSeeAllTickets: () => void;
}

/**
 * The next thing I'm going to: Home's hero, on the ticket's sky shade. The
 * countdown leads in sky, then the event, when and where, one tap from the QR.
 */
export default function UpNextCard({ ticket, moreCount, onOpenTicket, onSeeAllTickets }: UpNextCardProps) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const venue = ticket.venueName || ticket.city || (ticket.type === 'ONLINE' ? 'Online' : 'Venue TBA');
  const cover = coverOr(defaults, ticket.id, ticket.coverImageUrl);

  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.muted }]}>Up next</Text>
        {moreCount > 0 ? (
          <PressableScale
            feedback="inline"
            onPress={onSeeAllTickets}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`See all my tickets, ${moreCount} more`}
          >
            <Text style={[styles.more, { color: c.text }]}>+{moreCount} more</Text>
          </PressableScale>
        ) : null}
      </View>

      <ShadeCard tone="sky" onPress={onOpenTicket} accessibilityLabel={`Open ticket for ${ticket.title}`}>
        <View style={styles.main}>
          <View style={{ flex: 1, gap: spacing[1] }}>
            <Text style={[styles.countdown, { color: c.sky }]} numberOfLines={1} adjustsFontSizeToFit>
              {countdownLabel(ticket.startDateTime)}
            </Text>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{ticket.title}</Text>
          </View>
          <View style={[styles.thumb, { backgroundColor: c.card }]}>
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
            )}
          </View>
        </View>

        <View style={[styles.rule, { backgroundColor: c.border }]} />

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.when, { color: c.text }]}>{relativeWhen(ticket.startDateTime)}</Text>
            <Text style={[styles.venue, { color: c.soft }]} numberOfLines={1}>{venue}</Text>
          </View>
          <View style={[styles.qr, { backgroundColor: c.primary }]}>
            <QrCode size={16} color={c.primaryFg} weight="bold" />
            <Text style={[styles.qrText, { color: c.primaryFg }]}>Ticket</Text>
          </View>
        </View>
      </ShadeCard>
    </View>
  );
}

/** Placeholder with the same label row, headline, rule and footer heights. */
export function UpNextCardSkeleton() {
  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.labelRow}>
        <Skeleton width={56} height={14} borderRadius={6} />
      </View>
      <View style={[styles.card, { padding: spacing[5] }]}>
        <CardBackdrop shape={styles.card} />
        <View style={styles.main}>
          <View style={{ flex: 1, gap: 10 }}>
            <Skeleton width={120} height={28} borderRadius={8} />
            <Skeleton width="80%" height={16} borderRadius={6} />
          </View>
          <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.md} />
        </View>
        <View style={styles.rule} />
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

// Event banners are 4:3.
const THUMB_W = 84;
const THUMB_H = 63;

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  more: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  main: { flexDirection: 'row', gap: spacing[4], alignItems: 'center' },
  countdown: { fontSize: 30, lineHeight: 36, ...cosmosFont.figure },
  title: { fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.25, ...cosmosFont.strong },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: spacing[4] },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
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
