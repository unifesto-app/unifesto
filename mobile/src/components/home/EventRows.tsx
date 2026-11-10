import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Event } from '../../lib/api/events';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';
import { crowdLabel, groupByDay, relativeWhen, rowTime, shortPrice } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { CardBackdrop } from '../ui/CardSurface';
import PressableScale from '../ui/PressableScale';
import AuthButton from '../auth/AuthButton';
import { GUTTER } from './Section';
import { Rows } from './SpacePanel';

/** Events "Happening near you" shows (hero included) before its All events row. */
const MAX = 8;
// 4:3 like every event cover, the same size as the My space rows so the lists line up.
const THUMB_W = 64;
const THUMB_H = 48;

const whereOf = (e: Event) => e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null);

/** Price in sky, then the crowd ("64 going", or "Almost full" in amber). Nothing when neither applies. */
function PriceLine({ event: e }: { event: Event }) {
  const c = useCosmos();
  const price = shortPrice(e);
  const crowd = crowdLabel(e);
  if (!price && !crowd) return null;
  return (
    <Text style={styles.price} numberOfLines={1}>
      {price ? <Text style={{ color: c.sky }}>{price}</Text> : null}
      {crowd ? (
        <Text style={[styles.crowd, { color: crowd.hot ? c.warn : c.muted }]}>
          {price ? ' · ' : ''}
          {crowd.text}
        </Text>
      ) : null}
    </Text>
  );
}

const a11y = (e: Event, ...parts: (string | null | undefined)[]) =>
  [e.title, ...parts, shortPrice(e), crowdLabel(e)?.text].filter(Boolean).join(', ');

/**
 * One event as a row on the page: 4:3 thumb, title, host · when · where, then
 * price and crowd. `day` is the group label above it, so VoiceOver reads the day
 * too. `hideHost` for a list that is already one space's.
 */
export function EventRow({
  event: e,
  when,
  day,
  hideHost,
  onPress,
}: {
  event: Event;
  when: string;
  day?: string;
  hideHost?: boolean;
  onPress: () => void;
}) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const cover = coverOr(defaults, e.id, e.coverImageUrl);
  const host = hideHost ? null : e.space?.name;
  const where = whereOf(e);
  return (
    <PressableScale
      feedback="inline"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y(e, host, day, when, where)}
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
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>{[host, when, where].filter(Boolean).join(' · ')}</Text>
        <PriceLine event={e} />
      </View>
    </PressableScale>
  );
}

/** The soonest event, opening the list: its cover at full width, so the list has one picture that sells. */
export function EventHero({ event: e, onPress }: { event: Event; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const cover = coverOr(defaults, e.id, e.coverImageUrl);
  const when = new Date(e.startDateTime) <= new Date() ? 'Happening now' : relativeWhen(e.startDateTime);
  const where = whereOf(e);
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y(e, e.space?.name, when, where)}>
      <View style={[styles.cover, { backgroundColor: c.card }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <Text style={[styles.heroTitle, { color: c.text }]} numberOfLines={2}>{e.title}</Text>
      <Text style={[styles.meta, styles.heroMeta, { color: c.muted }]} numberOfLines={2}>
        {[e.space?.name, when, where].filter(Boolean).join(' · ')}
      </Text>
      <PriceLine event={e} />
    </PressableScale>
  );
}

/**
 * The text row that closes a list ("All events in Hyderabad", "Explore spaces"),
 * with a full hairline above it like the rows. Sky by default; `muted` for a
 * state that is already on (a city alert).
 */
export function ActionRow({ label, onPress, muted, hint }: { label: string; onPress: () => void; muted?: boolean; hint?: string }) {
  const c = useCosmos();
  return (
    <PressableScale
      feedback="inline"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={[styles.action, { borderTopColor: c.border }]}
    >
      <Text style={[styles.title, { color: muted ? c.muted : c.sky }]} numberOfLines={2}>{label}</Text>
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
  /** A row above All events (the city alert), shown with the list or its empty state. */
  footer?: React.ReactNode;
}

/**
 * The soonest event as a hero, then the next few as rows under a day label,
 * closed by a sky "All events" row. The day is in the label, so each row only
 * says the time.
 */
export default function DayRows({ events, loading, failed, onRetry, onPressEvent, allLabel, onSeeAll, footer }: DayRowsProps) {
  const c = useCosmos();
  // Not memoised: a cheap pass that keeps Today and Tomorrow right on any render.
  const groups = groupByDay(events, MAX);
  // The first load holds the skeleton until every feed is in, so rows don't move
  // under a finger as the city's events arrive; a refresh keeps the rows shown.
  const settled = React.useRef(false);
  if (!loading) settled.current = true;

  if (loading && (!settled.current || groups.length === 0)) {
    return (
      <View style={styles.wrap}>
        <Rows>{[0, 1, 2].map((i) => <EventRowSkeleton key={i} />)}</Rows>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.wrap}>
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            {failed ? "Couldn't load events" : 'Nothing on the calendar yet'}
          </Text>
          <Text style={[styles.emptyText, { color: c.muted }]}>
            {failed ? 'Check your connection and try again.' : 'New events land here first. Pull to refresh.'}
          </Text>
          {failed && onRetry ? <AuthButton label="Try again" variant="secondary" onPress={onRetry} style={styles.retry} /> : null}
        </View>
        {failed ? null : <View style={styles.emptyFooter}>{footer}</View>}
      </View>
    );
  }

  const hero = groups[0].events[0];
  const rest = groups.map((g, i) => (i === 0 ? { ...g, events: g.events.slice(1) } : g)).filter((g) => g.events.length > 0);

  return (
    <View style={styles.wrap}>
      <EventHero event={hero} onPress={() => onPressEvent(hero)} />
      {rest.map((g) => (
        <View key={g.label} style={styles.group}>
          <Text style={[styles.day, { color: c.muted }]} accessibilityRole="header">{g.label}</Text>
          <Rows>
            {g.events.map((e) => (
              <EventRow key={e.id} event={e} day={g.label} when={rowTime(e)} onPress={() => onPressEvent(e)} />
            ))}
          </Rows>
        </View>
      ))}
      {/* Straight under the last row's padding; a hero alone needs the gap. */}
      <View style={rest.length ? null : styles.closing}>
        {footer}
        <ActionRow label={allLabel} onPress={onSeeAll} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER },
  group: { marginTop: spacing[5] },
  day: { fontSize: typography.fontSize.sm, marginBottom: spacing[1], ...cosmosFont.strong },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  // The action rows closing the list, a full hairline above each like the rows.
  action: { paddingVertical: spacing[3], borderTopWidth: StyleSheet.hairlineWidth },
  closing: { marginTop: spacing[3] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: cosmosCardRadius, overflow: 'hidden' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  heroTitle: { marginTop: spacing[3], fontSize: 22, lineHeight: 28, ...cosmosFont.display },
  heroMeta: { marginTop: spacing[1], marginBottom: 2 },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  price: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  crowd: { ...cosmosFont.body },
  empty: {
    borderRadius: cosmosCardRadius,
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    gap: 6,
  },
  emptyFooter: { marginTop: spacing[3] },
  emptyTitle: { fontSize: 20, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  retry: { marginTop: spacing[4] },
});
