import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { Event } from '../lib/api/events';
import { getFavorites } from '../lib/api/favorites';
import FavoriteButton from '../components/FavoriteButton';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import PosterCard, { PosterCardSkeleton } from '../components/home/PosterCard';
import { GUTTER, Section } from '../components/home/Section';
import useTopSpacing from '../hooks/useTopSpacing';
import { countdownLabel, relativeWhen, shortPrice } from '../utils/eventFormat';
import { isEventOver } from '../lib/upcomingTickets';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { coverOr, useDefaultImages } from '../lib/defaultImages';

// Event banners are 4:3.
const THUMB_W = 84;
const THUMB_H = 63;
const reflow = LinearTransition.duration(220);

const placeOf = (e: Event) => e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null);

/**
 * Profile › Saved: the soonest saved event as a full poster ("Up next"), the
 * rest of what's coming as compact cards, then what's already happened, faded.
 * Un-hearting removes a card live (FavoritesContext updates ids optimistically).
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const c = useCosmos();
  const { width } = useWindowDimensions();
  const defaults = useDefaultImages();
  const { isAuthenticated } = useAuth();
  const { favoriteIds, refresh } = useFavorites();
  const topSpacing = useTopSpacing();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setEvents([]);
      setLoading(false);
      return;
    }
    const [list] = await Promise.all([getFavorites(), refresh()]);
    setEvents(list);
    setLoading(false);
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Same rule as Tickets: an event stays upcoming until it ends.
  const { next, later, past } = useMemo(() => {
    const saved = events.filter((e) => favoriteIds.has(e.id));
    const at = (e: Event) => new Date(e.startDateTime).getTime();
    const upcoming = saved.filter((e) => !isEventOver(e)).sort((a, b) => at(a) - at(b));
    return {
      next: upcoming[0] as Event | undefined,
      later: upcoming.slice(1),
      past: saved.filter((e) => isEventOver(e)).sort((a, b) => at(b) - at(a)),
    };
  }, [events, favoriteIds]);

  const openEvent = (e: Event) => router.push(`/event/${e.slug || e.id}`);
  const posterWidth = width - GUTTER * 2;

  const page = (children: React.ReactNode) => (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isAuthenticated ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.text}
              colors={[c.text]}
              progressViewOffset={topSpacing}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );

  const promptCard = (title: string, body: string, actions: React.ReactNode) =>
    page(
      <View style={[styles.prompt, { backgroundColor: c.raised }]}>
        <Heart size={40} color={c.soft} weight="duotone" />
        <Text style={[styles.promptTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.promptBody, { color: c.soft }]}>{body}</Text>
        {actions}
      </View>,
    );

  if (!isAuthenticated) {
    return promptCard(
      'Keep events for later',
      'Sign in and tap the heart on any event. Saved events sync across your devices.',
      <>
        <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={{ marginTop: spacing[6] }} />
        <AuthButton label="Browse events" variant="secondary" onPress={() => router.push('/events')} style={{ marginTop: spacing[3] }} />
      </>,
    );
  }

  if (loading) {
    return page(
      <View style={styles.pad}>
        <PosterCardSkeleton width={posterWidth} />
        <View style={[styles.list, { marginTop: spacing[8] }]}>
          {[0, 1].map((i) => <SavedCardSkeleton key={i} />)}
        </View>
      </View>,
    );
  }

  if (!next && past.length === 0) {
    return promptCard(
      'Nothing saved yet',
      'Tap the heart on any event and it lands here, soonest first.',
      <AuthButton label="Browse events" arrow onPress={() => router.push('/events')} style={{ marginTop: spacing[6] }} />,
    );
  }

  return page(
    <>
      {next ? (
        <Animated.View key={next.id} entering={FadeIn} exiting={FadeOut.duration(180)} layout={reflow} style={styles.pad}>
          <View style={styles.eyebrowRow}>
            <Text style={[styles.eyebrow, { color: c.muted }]}>Up next</Text>
            <FavoriteButton eventId={next.id} size={20} color={c.soft} />
          </View>
          <PosterCard
            width={posterWidth}
            title={next.title}
            imageUrl={coverOr(defaults, next.id, next.coverImageUrl)}
            when={relativeWhen(next.startDateTime)}
            where={placeOf(next)}
            host={next.space?.name}
            tag={countdownLabel(next.startDateTime)}
            price={shortPrice(next)}
            onPress={() => openEvent(next)}
          />
        </Animated.View>
      ) : null}

      {later.length > 0 ? (
        <Animated.View layout={reflow}>
          <Section title="Coming up" subtitle={`${later.length} more saved`} style={next ? undefined : styles.firstSection}>
            <View style={[styles.list, styles.pad]}>
              {later.map((e) => <SavedCard key={e.id} event={e} onPress={() => openEvent(e)} />)}
            </View>
          </Section>
        </Animated.View>
      ) : null}

      {past.length > 0 ? (
        <Animated.View layout={reflow}>
          <Section title="Been and gone" subtitle="Saved events that have ended" style={next || later.length ? undefined : styles.firstSection}>
            <View style={[styles.list, styles.pad]}>
              {past.map((e) => <SavedCard key={e.id} event={e} past onPress={() => openEvent(e)} />)}
            </View>
          </Section>
        </Animated.View>
      ) : null}
    </>,
  );
}

/** Compact saved card: 4:3 thumb, title, host, when · where, price, heart. */
function SavedCard({ event, past = false, onPress }: { event: Event; past?: boolean; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const cover = coverOr(defaults, event.id, event.coverImageUrl);
  const meta = [relativeWhen(event.startDateTime), placeOf(event)].filter(Boolean).join(' · ');

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut.duration(180)} layout={reflow}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[event.title, event.space?.name, meta].filter(Boolean).join(', ')}
        style={({ pressed }) => [styles.card, { backgroundColor: c.raised, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
      >
        <View style={[styles.cardMain, past && { opacity: 0.62 }]}>
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
        </View>
        <FavoriteButton eventId={event.id} size={20} color={c.soft} style={styles.cardHeart} />
      </Pressable>
    </Animated.View>
  );
}

function SavedCardSkeleton() {
  const c = useCosmos();
  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <View style={styles.cardMain}>
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
  container: { flex: 1 },
  content: { paddingBottom: 100 },
  pad: { paddingHorizontal: GUTTER },
  // Section brings its own large top margin; trim it when nothing sits above.
  firstSection: { marginTop: spacing[4] },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[4], marginBottom: spacing[3] },
  eyebrow: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  list: { gap: spacing[3] },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: cosmosCardRadius, overflow: 'hidden' },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3] },
  cardHeart: { paddingRight: spacing[4], paddingLeft: spacing[1] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  info: { flex: 1, gap: 3 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  host: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  price: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  prompt: { marginHorizontal: GUTTER, marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  promptTitle: { marginTop: spacing[5], fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  promptBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
