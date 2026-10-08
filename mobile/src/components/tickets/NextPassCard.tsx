import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { QrCode, UsersThree } from '@unifesto/unicon/react-native';
import type { MyTicket } from '../../hooks/useMyTickets';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import Skeleton from '../Skeleton';
import { countdownLabel, relativeWhen } from '../../utils/eventFormat';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';

/**
 * The next thing you're going to, big: a 4:3 cover over a ticket stub
 * (perforation, notched edges) so it reads as "your pass", one tap from the QR.
 */
export default function NextPassCard({ ticket, onPress }: { ticket: MyTicket; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const cover = coverOr(defaults, ticket.id, ticket.coverImageUrl);
  const venue = ticket.venueName || ticket.city || (ticket.type === 'ONLINE' ? 'Online' : 'Venue TBA');
  const typeName = typeof ticket.ticketType === 'string' ? ticket.ticketType : ticket.ticketType?.name;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ticket for ${ticket.title}`}
      style={({ pressed }) => [styles.card, { backgroundColor: LIQUID_GLASS ? undefined : c.raised, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <GlassFill radius={cosmosCardRadius} />
      <View style={[styles.cover, { backgroundColor: c.card }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
        )}
      </View>

      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: c.tint }]}>
          <View style={[styles.badgeDot, { backgroundColor: c.primary }]} />
          <Text style={[styles.badgeText, { color: c.primary }]}>{countdownLabel(ticket.startDateTime)}</Text>
        </View>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{ticket.title}</Text>
        {ticket.isGroupMember ? (
          <View style={styles.groupRow}>
            <UsersThree size={14} color={c.muted} weight="fill" />
            <Text style={[styles.venue, { color: c.muted, marginTop: 0 }]} numberOfLines={1}>
              In {ticket.leadName ? `${ticket.leadName}'s` : 'a'} group
            </Text>
          </View>
        ) : typeName ? (
          <Text style={[styles.venue, { color: c.muted }]} numberOfLines={1}>{typeName}</Text>
        ) : null}
      </View>

      {/* Perforation between body and stub, with notches cut into both edges */}
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
          <Text style={[styles.qrText, { color: c.primaryFg }]}>Show pass</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Placeholder with the same cover, body, perforation and footer heights. */
export function NextPassCardSkeleton() {
  const c = useCosmos();
  return (
    <View style={[styles.card, { backgroundColor: LIQUID_GLASS ? undefined : c.raised }]}>
      <GlassFill radius={cosmosCardRadius} />
      <View style={[styles.cover, { backgroundColor: c.card }]} />
      <View style={[styles.body, { gap: 10 }]}>
        <Skeleton width={84} height={20} borderRadius={borderRadius.full} />
        <Skeleton width="80%" height={18} borderRadius={6} />
      </View>
      <View style={styles.perfRow} />
      <View style={styles.footer}>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="45%" height={14} borderRadius={6} />
          <Skeleton width="60%" height={12} borderRadius={6} />
        </View>
        <Skeleton width={112} height={40} borderRadius={cosmosRadius} />
      </View>
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  // Event banners are 4:3; full width so the pass leads with the event.
  cover: { width: '100%', aspectRatio: 4 / 3 },
  body: { gap: 6, paddingHorizontal: spacing[4], paddingTop: spacing[4] },
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
  title: { fontSize: 18, lineHeight: 26, ...cosmosFont.display },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perfRow: { height: NOTCH, justifyContent: 'center', marginTop: spacing[3] },
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
    height: 40,
    borderRadius: cosmosRadius,
  },
  qrText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
