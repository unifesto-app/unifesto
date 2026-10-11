import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { Event } from '../../lib/api/events';
import Skeleton from '../Skeleton';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { CoverTag } from './PosterCard';
import { relativeWhen, shortPrice } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';
import PressableScale from '../ui/PressableScale';
import { selectionTick } from '../../lib/haptics';
import { scheduleOnRN } from 'react-native-worklets';
import AuthButton from '../auth/AuthButton';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';

const GAP = spacing[3];
const MAX_SLIDES = 8;
/** Cards take ~3/4 of the screen so the 4:3 banner stays compact and the next one peeks in. */
const CARD_RATIO = 0.74;

interface HeroCarouselProps {
  events: Event[];
  loading: boolean;
  /** The feed request failed: offer a retry instead of claiming there's nothing on. */
  failed?: boolean;
  onRetry?: () => void;
  onPressEvent: (event: Event) => void;
}

/**
 * Compact cover-flow: 4:3 banners shown uncropped, the focused card at full
 * size while its neighbours shrink and dim as you swipe. All driven by one
 * shared scroll value on the UI thread, so it stays smooth on low-end phones.
 */
function HeroCarousel({ events, loading, failed, onRetry, onPressEvent }: HeroCarouselProps) {
  const c = useCosmos();
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.round(screenW * CARD_RATIO);
  const coverH = Math.round((cardW * 3) / 4);
  const snap = cardW + GAP;
  // Room after the last card so it can scroll to the same resting spot as the
  // others. With only the gutter there, content ran out ~a quarter card short
  // of the last snap point: the final swipe bounced off the end and the last
  // card never came fully into focus (dimmed, shrunk, its dot never lit).
  const endPad = Math.max(GUTTER, screenW - cardW - GUTTER);
  const scrollX = useSharedValue(0);
  // Card nearest the resting point; a light tick each time a new one comes into
  // focus, like a picker detent. Only while a finger or momentum drives it.
  const focused = useSharedValue(0);
  const last = Math.min(events.length, MAX_SLIDES) - 1;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      // Clamped, so the edge bounce never counts as a new card.
      const i = Math.max(0, Math.min(last, Math.round(e.contentOffset.x / snap)));
      if (i !== focused.value) {
        focused.value = i;
        scheduleOnRN(selectionTick);
      }
    },
  });

  const slides = events.slice(0, MAX_SLIDES);

  if (loading) {
    return (
      <View style={styles.skeletonRow}>
        <Skeleton width={cardW} height={coverH + 64} borderRadius={cosmosCardRadius} />
        <Skeleton width={cardW} height={coverH + 64} borderRadius={cosmosCardRadius} />
      </View>
    );
  }

  if (slides.length === 0) {
    return (
      <View style={[styles.empty, { marginHorizontal: GUTTER }]}>
        <CardBackdrop shape={styles.empty} />
        {failed ? (
          <>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Couldn't load events</Text>
            <Text style={[styles.emptyText, { color: c.muted }]}>Check your connection and try again.</Text>
            {onRetry ? <AuthButton label="Try again" variant="secondary" onPress={onRetry} style={styles.retry} /> : null}
          </>
        ) : (
          <>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Nothing on the calendar yet</Text>
            <Text style={[styles.emptyText, { color: c.muted }]}>New events land here first. Pull to refresh.</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snap}
        snapToAlignment="start"
        // A flick can travel several cards and still land on one; stopping
        // dead at every card (disableIntervalMomentum) felt like stutter.
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingLeft: GUTTER, paddingRight: endPad, gap: GAP }}
      >
        {slides.map((event, i) => (
          <Slide
            key={event.id}
            event={event}
            index={i}
            scrollX={scrollX}
            snap={snap}
            cardW={cardW}
            coverH={coverH}
            onPressEvent={onPressEvent}
          />
        ))}
      </Animated.ScrollView>

      {slides.length > 1 ? (
        // Decorative: VoiceOver reaches every card directly.
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((e, i) => (
            <Dot key={e.id} index={i} scrollX={scrollX} snap={snap} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface SlideProps {
  event: Event;
  index: number;
  scrollX: SharedValue<number>;
  snap: number;
  cardW: number;
  coverH: number;
  onPressEvent: (event: Event) => void;
}

// Memoised so a Home refresh (tickets, invites, workspace) doesn't re-render
// every slide mid-swipe; the swipe itself never re-renders (UI-thread styles).
const Slide = React.memo(function Slide({ event, index, scrollX, snap, cardW, coverH, onPressEvent }: SlideProps) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const reduced = useReducedMotion();
  const titleLines = useWindowDimensions().fontScale > 1.3 ? 2 : 1;
  const place = event.venueName || event.city || (event.type === 'ONLINE' ? 'Online' : null);
  const tag = event.categories?.[0] || event.category;

  // Distance from focus in "cards": 0 = centred, 1 = one card away.
  // Reduce Motion: every card stays still and fully lit.
  const animated = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [{ scale: 1 }] };
    const d = Math.abs(scrollX.value / snap - index);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.45], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.9], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View style={[{ width: cardW }, animated]}>
      <PressableScale
        onPress={() => onPressEvent(event)}
        accessibilityRole="button"
        accessibilityLabel={[event.title, relativeWhen(event.startDateTime), shortPrice(event), place].filter(Boolean).join(', ')}
      >
        <View style={[styles.cover, { height: coverH, backgroundColor: c.card }]}>
          {coverOr(defaults, event.id, event.coverImageUrl) ? (
            <Image
              source={{ uri: coverOr(defaults, event.id, event.coverImageUrl) ?? undefined }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              // Fade in instead of popping in while the card is sliding.
              transition={180}
              cachePolicy="memory-disk"
              recyclingKey={event.id}
            />
          ) : (
            <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          {tag ? <CoverTag label={tag} style={styles.tag} /> : null}
        </View>

        <Text style={[styles.title, { color: c.text }]} numberOfLines={titleLines}>{event.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={{ color: c.primary }}>{relativeWhen(event.startDateTime)}</Text>
          <Text style={{ color: c.soft }}>{`  ·  ${shortPrice(event)}`}</Text>
          {place ? <Text style={{ color: c.muted }}>{`  ·  ${place}`}</Text> : null}
        </Text>
      </PressableScale>
    </Animated.View>
  );
});

export default React.memo(HeroCarousel);

function Dot({ index, scrollX, snap }: { index: number; scrollX: SharedValue<number>; snap: number }) {
  const c = useCosmos();
  // The focused dot stretches into a pill and lights up in accent. Scaled with
  // a transform, not width, so swiping never triggers a layout pass.
  const animated = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / snap - index);
    const t = interpolate(d, [0, 1], [1, 0], Extrapolation.CLAMP);
    return { opacity: 0.25 + t * 0.75, transform: [{ scaleX: 0.3 + t * 0.7 }] };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: c.primary }, animated]} />;
}

const styles = StyleSheet.create({
  skeletonRow: { flexDirection: 'row', gap: GAP, paddingHorizontal: GUTTER, overflow: 'hidden' },
  cover: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  tag: { position: 'absolute', left: spacing[3], bottom: spacing[3] },
  title: {
    marginTop: spacing[3],
    fontSize: typography.fontSize.lg,
    letterSpacing: -0.2,
    ...cosmosFont.strong,
  },
  meta: { marginTop: 3, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 1, marginTop: spacing[4] },
  dot: { width: 20, height: 6, borderRadius: 3 },
  empty: {
    borderRadius: cosmosCardRadius,
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  retry: { marginTop: spacing[4] },
});
