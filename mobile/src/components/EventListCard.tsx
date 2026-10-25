import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Event } from '../lib/api/events';
import FavoriteButton from './FavoriteButton';
import Skeleton from './Skeleton';
import { relativeWhen, shortPrice } from '../utils/eventFormat';
import { coverOr, useDefaultImages } from '../lib/defaultImages';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

// Event banners are 4:3.
const THUMB_W = 84;
const THUMB_H = 63;

export const placeOf = (e: Event) => e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null);

/** Compact cosmos event card: 4:3 thumb, title, host, when · where, price, heart. `past` fades it and drops the price. */
export default function EventListCard({ event, past = false, onPress }: { event: Event; past?: boolean; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const cover = coverOr(defaults, event.id, event.coverImageUrl);
  const meta = [relativeWhen(event.startDateTime), placeOf(event)].filter(Boolean).join(' · ');

  // The heart is a sibling of the card's pressable, not inside it: VoiceOver
  // reads a pressable as one element, so a nested button can't be reached.
  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[event.title, event.space?.name, meta, past ? null : shortPrice(event)].filter(Boolean).join(', ')}
        style={({ pressed }) => [styles.main, past && { opacity: 0.62 }, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
      >
        <View style={[styles.thumb, { backgroundColor: c.card }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{event.title}</Text>
          {event.space?.name ? (
            <Text style={[styles.host, { color: c.muted }]} numberOfLines={1}>{event.space.name}</Text>
          ) : null}
          <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>{meta}</Text>
          {past ? null : <Text style={[styles.price, { color: c.text }]}>{shortPrice(event)}</Text>}
        </View>
      </Pressable>
      <FavoriteButton eventId={event.id} size={20} color={c.soft} style={styles.heart} />
    </View>
  );
}

export function EventListCardSkeleton() {
  const c = useCosmos();
  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <View style={styles.main}>
        <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.md} />
        <View style={[styles.info, { gap: 8 }]}>
          <Skeleton width="85%" height={14} borderRadius={6} />
          <Skeleton width="55%" height={12} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: cosmosCardRadius, overflow: 'hidden' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3] },
  heart: { paddingRight: spacing[4], paddingLeft: spacing[1] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  info: { flex: 1, gap: 3 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  host: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  price: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
});
