import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ManagedEvent } from '../../lib/api/manageSpace';
import { relativeWhen } from '../../utils/eventFormat';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import Skeleton from '../Skeleton';

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

/**
 * One event in Manage space as a row on the page (the list draws the hairlines):
 * 4:3 cover (the admin default when it has none), title, status, and the
 * headcount in sky.
 */
export default function ManageEventRow({ event, now, onPress }: Props) {
  const c = useCosmos();
  const cover = coverOr(useDefaultImages(), event.id, event.coverImageUrl);
  const status = statusLine(event, now);
  const people = event.attendees?.total ?? 0;
  const capacity = event.capacity ? ` / ${event.capacity.toLocaleString('en-IN')}` : '';
  const statusColor = status.tone === 'live' ? c.mint : status.tone === 'danger' ? c.danger : c.muted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${status.text}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.thumb, { backgroundColor: c.card }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.statusRow}>
          {status.tone === 'live' ? <View style={[styles.dot, { backgroundColor: c.mint }]} /> : null}
          <Text style={[styles.meta, styles.status, { color: statusColor }]} numberOfLines={1}>
            {status.text}
            {event.isCoHost ? <Text style={{ color: c.muted }}>{'  ·  Co-hosting'}</Text> : null}
          </Text>
        </View>
        {event.status !== 'DRAFT' ? (
          <Text style={[styles.meta, { color: c.sky }]} numberOfLines={1}>
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
    <View style={styles.row}>
      <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={THUMB_RADIUS} />
      <View style={[styles.body, { gap: 8 }]}>
        <Skeleton width="80%" height={16} />
        <Skeleton width="50%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // On the page: no side padding, the list draws full hairlines between rows.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: THUMB_RADIUS, overflow: 'hidden' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.3, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { flexShrink: 1, ...cosmosFont.strong },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
