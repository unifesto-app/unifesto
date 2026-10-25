import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CalendarBlank } from '@unifesto/unicon/react-native';
import type { CheckinEvent } from '../../lib/api/checkin';
import { CardBackdrop } from '../ui/CardSurface';
import { relativeWhen } from '../../utils/eventFormat';
import type { CheckinPhase } from '../../utils/checkinFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const COVER_W = 96;
const COVER_H = 72; // 4:3

/** One event on the check-in list: 4:3 cover, title, when, and headcount. */
export default function CheckinEventCard({
  event,
  phase,
  onPress,
}: {
  event: CheckinEvent;
  phase: CheckinPhase;
  onPress: () => void;
}) {
  const c = useCosmos();
  const count = event._count?.registrations ?? 0;
  const meta = [event.space?.name, `${count.toLocaleString('en-IN')} registered`].filter(Boolean).join(' · ');
  const points = event.checkinTypes?.length ?? 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={event.title}
      style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <CardBackdrop shape={styles.card} />
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={[styles.cover, { backgroundColor: c.card }]} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty, { backgroundColor: c.card }]}>
          <CalendarBlank size={26} color={c.muted} />
        </View>
      )}
      <View style={styles.body}>
        {phase === 'live' ? (
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, { backgroundColor: c.success }]} />
            <Text style={[styles.live, { color: c.success }]}>Live now</Text>
          </View>
        ) : (
          <Text style={[styles.when, { color: phase === 'ended' ? c.muted : c.primary }]} numberOfLines={1}>
            {phase === 'ended' ? 'Ended' : relativeWhen(event.startDateTime)}
          </Text>
        )}
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
          {meta}
          {points > 1 ? ` · ${points} points` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[3],
    borderRadius: borderRadius.xl,
  },
  cover: { width: COVER_W, height: COVER_H, borderRadius: borderRadius.md },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  live: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  when: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  title: { fontSize: typography.fontSize.base, lineHeight: 21, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
