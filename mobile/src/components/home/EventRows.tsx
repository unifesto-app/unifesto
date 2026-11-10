import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDots } from '@unifesto/unicon/react-native';
import type { Event } from '../../lib/api/events';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import { formatTime, groupByDay, shortPrice } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { CardBackdrop } from '../ui/CardSurface';
import PressableScale from '../ui/PressableScale';
import AuthButton from '../auth/AuthButton';
import { GUTTER } from './Section';
import { Rows } from './SpacePanel';

/** Rows "Happening near you" shows before its All events row. */
const MAX = 8;
// 4:3 like every event cover, the same size as the My space rows so the lists line up.
const THUMB_W = 64;
const THUMB_H = 48;

/** One event as a row on the page: 4:3 thumb, title, when · where, price in sky. */
export function EventRow({ event: e, when, onPress }: { event: Event; when: string; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const cover = coverOr(defaults, e.id, e.coverImageUrl);
  const where = e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null);
  const price = shortPrice(e);
  return (
    <PressableScale
      feedback="inline"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[e.title, when, where, price].filter(Boolean).join(', ')}
      style={styles.row}
    >
      <View style={[styles.thumb, { backgroundColor: c.card }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{e.title}</Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>{[when, where].filter(Boolean).join(' · ')}</Text>
        {price ? <Text style={[styles.price, { color: c.sky }]}>{price}</Text> : null}
      </View>
    </PressableScale>
  );
}

export function EventRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.md} />
      <View style={[styles.body, { gap: 8 }]}>
        <Skeleton width="70%" height={15} borderRadius={6} />
        <Skeleton width="45%" height={12} borderRadius={6} />
      </View>
    </View>
  );
}

interface DayRowsProps {
  events: Event[];
  loading: boolean;
  /** The feed request failed: offer a retry instead of claiming there's nothing on. */
  failed?: boolean;
  onRetry?: () => void;
  onPressEvent: (event: Event) => void;
  /** The closing action row, e.g. "All events in Hyderabad". */
  allLabel: string;
  onSeeAll: () => void;
}

/**
 * The next few events as rows under a day label, closed by a sky "All events"
 * row. The day is in the label, so each row only says the time.
 */
export default function DayRows({ events, loading, failed, onRetry, onPressEvent, allLabel, onSeeAll }: DayRowsProps) {
  const c = useCosmos();
  const groups = React.useMemo(() => groupByDay(events, MAX), [events]);

  if (loading && events.length === 0) {
    return (
      <View style={styles.wrap}>
        <Rows>{[0, 1, 2].map((i) => <EventRowSkeleton key={i} />)}</Rows>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={[styles.empty, { marginHorizontal: GUTTER }]}>
        <CardBackdrop shape={styles.empty} />
        <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
          {failed ? "Couldn't load events" : 'Nothing on the calendar yet'}
        </Text>
        <Text style={[styles.emptyText, { color: c.muted }]}>
          {failed ? 'Check your connection and try again.' : 'New events land here first. Pull to refresh.'}
        </Text>
        {failed && onRetry ? <AuthButton label="Try again" variant="secondary" onPress={onRetry} style={styles.retry} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {groups.map((g, i) => (
        <View key={g.label} style={i > 0 ? styles.group : null}>
          <Text style={[styles.day, { color: c.muted }]} accessibilityRole="header">{g.label}</Text>
          <Rows>
            {g.events.map((e) => (
              <EventRow key={e.id} event={e} when={formatTime(new Date(e.startDateTime))} onPress={() => onPressEvent(e)} />
            ))}
          </Rows>
        </View>
      ))}
      <PressableScale
        feedback="inline"
        onPress={onSeeAll}
        accessibilityRole="button"
        accessibilityLabel={allLabel}
        style={[styles.row, styles.all, { borderTopColor: c.border }]}
      >
        <View style={styles.glyph}>
          <CalendarDots size={24} color={c.sky} />
        </View>
        <Text style={[styles.title, { color: c.sky }]} numberOfLines={1}>{allLabel}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER },
  group: { marginTop: spacing[5] },
  day: { fontSize: typography.fontSize.sm, marginBottom: spacing[1], ...cosmosFont.strong },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  // The action row closing the list, a full hairline above it like the rows.
  all: { paddingVertical: spacing[3], borderTopWidth: StyleSheet.hairlineWidth },
  glyph: { width: THUMB_W, alignItems: 'center' },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  price: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  empty: {
    borderRadius: cosmosCardRadius,
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 20, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  retry: { marginTop: spacing[4] },
});
