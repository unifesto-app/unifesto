import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Heart } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { Event } from '../lib/api/events';
import { getFavorites } from '../lib/api/favorites';
import FavoriteButton from '../components/FavoriteButton';
import EventListCard, { EventListCardSkeleton, placeOf } from '../components/EventListCard';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import PosterCard, { PosterCardSkeleton } from '../components/home/PosterCard';
import { GUTTER } from '../components/home/Section';
import useTopSpacing from '../hooks/useTopSpacing';
import { countdownLabel, relativeWhen, shortPrice } from '../utils/eventFormat';
import { isEventOver } from '../lib/upcomingTickets';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';
import { coverOr, useDefaultImages } from '../lib/defaultImages';
import useContentWidth from '../hooks/useContentWidth';

const reflow = LinearTransition.duration(220);

/**
 * Profile › Saved: the soonest saved event as a full poster ("Up next"), then
 * the rest of what's coming and what's already happened (faded) as rows on the
 * page with full hairlines, no cards and no blurbs.
 * Un-hearting removes a row live (FavoritesContext updates ids optimistically):
 * each row fades out and the rest reflow, so the list keys rows by event, not
 * index (SettingsGroup would key by index).
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const c = useCosmos();
  const { width, hero } = useContentWidth();
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
  const posterWidth = Math.min(width - GUTTER * 2, hero);

  const page = (children: React.ReactNode) => (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[column, styles.content, { paddingTop: topSpacing }]}
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

  // An empty state straight on the page: one headline, one line, one button.
  const prompt = (title: string, body: string, action: React.ReactNode) =>
    page(
      <View style={styles.prompt}>
        <Heart size={44} color={c.muted} weight="duotone" />
        <Text style={[styles.promptTitle, { color: c.text }]} accessibilityRole="header">{title}</Text>
        <Text style={[styles.promptBody, { color: c.muted }]}>{body}</Text>
        {action}
      </View>,
    );

  if (!isAuthenticated) {
    return prompt(
      'Keep events for later',
      'Sign in and tap the heart on any event. Saved events sync across your devices.',
      <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={styles.promptButton} />,
    );
  }

  if (loading) {
    return page(
      <View style={styles.pad}>
        <PosterCardSkeleton width={posterWidth} />
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <View key={i} style={i > 0 && styles.gap}>
              <EventListCardSkeleton />
            </View>
          ))}
        </View>
      </View>,
    );
  }

  if (!next && past.length === 0) {
    return prompt(
      'Nothing saved yet',
      'Tap the heart on any event and it lands here, soonest first.',
      <AuthButton label="Browse events" arrow onPress={() => router.push('/events')} style={styles.promptButton} />,
    );
  }

  // A titled list of event cards, each keyed by its event.
  const list = (title: string, items: Event[], first: boolean, faded = false) => (
    <Animated.View layout={reflow} style={[styles.pad, styles.list, first && styles.first]}>
      <Text style={[styles.listTitle, { color: c.muted }]} accessibilityRole="header">{title}</Text>
      {items.map((e, i) => (
        <Animated.View
          key={e.id}
          entering={FadeIn}
          exiting={FadeOut.duration(180)}
          layout={reflow}
          style={i > 0 && styles.gap}
        >
          <EventListCard event={e} past={faded} onPress={() => openEvent(e)} />
        </Animated.View>
      ))}
    </Animated.View>
  );

  return page(
    <>
      {next ? (
        <Animated.View key={next.id} entering={FadeIn} exiting={FadeOut.duration(180)} layout={reflow} style={styles.pad}>
          <View style={[styles.eyebrowRow, { width: posterWidth }]}>
            <Text style={[styles.listTitle, styles.eyebrow, { color: c.muted }]}>Up next</Text>
            <FavoriteButton eventId={next.id} size={20} color={c.muted} />
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

      {later.length > 0 ? list('Coming up', later, !next) : null}
      {past.length > 0 ? list('Been and gone', past, !next && !later.length, true) : null}
    </>,
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 100 },
  pad: { paddingHorizontal: GUTTER },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[4], marginBottom: spacing[3] },
  // A settings page steps by spacing[8] between lists; tighter when nothing sits above.
  list: { marginTop: spacing[8] },
  first: { marginTop: spacing[4] },
  // Same as SettingsGroup's title: muted Hanken SemiBold, sentence case.
  listTitle: { marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  eyebrow: { marginBottom: 0 },
  // spacing[3] between cards in one list; lists step by spacing[8].
  gap: { marginTop: spacing[3] },
  prompt: { alignItems: 'center', paddingHorizontal: GUTTER, marginTop: spacing[10] },
  promptTitle: { marginTop: spacing[4], fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  promptBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  promptButton: { marginTop: spacing[6], alignSelf: 'stretch' },
});
