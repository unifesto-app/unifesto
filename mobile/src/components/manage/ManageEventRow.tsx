import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CalendarBlank } from '@unifesto/unicon/react-native';
import type { ManagedEvent } from '../../lib/api/manageSpace';
import { relativeWhen } from '../../utils/eventFormat';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { CardBackdrop } from '../ui/CardSurface';

const THUMB_W = 88;
const THUMB_H = 66; // 4:3, never cropped off-ratio
const THUMB_RADIUS = 12;

interface Props {
  event: ManagedEvent;
  now: Date;
  onPress: () => void;
}

function statusLine(e: ManagedEvent, now: Date): { text: string; tone: 'live' | 'muted' | 'danger' } {
  if (e.status === 'DRAFT') return { text: 'Draft', tone: 'muted' };
  if (e.status === 'CANCELLED') return { text: 'Cancelled', tone: 'danger' };
  const start = new Date(e.startDateTime).getTime();
  const end = new Date(e.endDateTime).getTime();
  const n = now.getTime();
  if (start <= n && n <= end) return { text: 'Live now', tone: 'live' };
  return { text: relativeWhen(e.startDateTime, now), tone: 'muted' };
}

export default function ManageEventRow({ event, now, onPress }: Props) {
  const c = useCosmos();
  const status = statusLine(event, now);
  const people = event.attendees?.total ?? 0;
  const capacity = event.capacity ? ` / ${event.capacity.toLocaleString('en-IN')}` : '';
  const statusColor = status.tone === 'live' ? c.success : status.tone === 'danger' ? c.danger : c.muted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <CardBackdrop shape={styles.row} />
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={[styles.thumb, { backgroundColor: c.card }]} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: c.tint }]}>
          <CalendarBlank size={24} color={c.muted} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={[styles.meta, { color: statusColor }]} numberOfLines={1}>
          {status.text}
          {event.isCoHost ? '  ·  Co-hosting' : ''}
        </Text>
        {event.status !== 'DRAFT' ? (
          <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>
            {people.toLocaleString('en-IN')}
            {capacity} attending
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ManageEventRowSkeleton() {
  return (
    <View style={[styles.row]}>
      <CardBackdrop shape={styles.row} />
      <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={THUMB_RADIUS} />
      <View style={[styles.body, { gap: 8 }]}>
        <Skeleton width="80%" height={16} />
        <Skeleton width="50%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: cosmosCardRadius,
  },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: THUMB_RADIUS, overflow: 'hidden' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.3, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
