import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../../context/ThemeContext';
import type { Event } from '../../lib/api/events';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { GUTTER } from './Section';
import { relativeWhen, shortPrice } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';

const GAP = spacing[3];
const MAX_SLIDES = 8;
/** Cards take ~3/4 of the screen so the 4:3 banner stays compact and the next one peeks in. */
const CARD_RATIO = 0.74;

interface HeroCarouselProps {
  events: Event[];
  loading: boolean;
  onPressEvent: (event: Event) => void;
}

/**
 * Compact cover-flow: 4:3 banners shown uncropped, the focused card at full
 * size while its neighbours shrink and dim as you swipe. All driven by one
 * shared scroll value on the UI thread, so it stays smooth on low-end phones.
 */
function HeroCarousel({ events, loading, onPressEvent }: HeroCarouselProps) {
  const tokens = useTokens();
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
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const slides = events.slice(0, MAX_SLIDES);

  if (loading) {
    return (
      <View style={styles.skeletonRow}>
        <Skeleton width={cardW} height={coverH + 64} borderRadius={borderRadius.xl} />
        <Skeleton width={cardW} height={coverH + 64} borderRadius={borderRadius.xl} />
      </View>
    );
  }

  if (slides.length === 0) {
    return (
      <View style={[styles.empty, { marginHorizontal: GUTTER }]}>
        <CardBackdrop shape={styles.empty} />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>Nothing on the calendar yet</Text>
        <Text style={[styles.emptyText, { color: tokens.textMuted }]}>New events land here first. Pull to refresh.</Text>
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
        decelerationRate="fast"
        disableIntervalMomentum
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
        <View style={styles.dots}>
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
  const tokens = useTokens();
  const place = event.venueName || event.city || (event.type === 'ONLINE' ? 'Online' : null);

  // Distance from focus in "cards": 0 = centred, 1 = one card away.
  const animated = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / snap - index);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.45], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.9], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View style={[{ width: cardW }, animated]}>
      <Pressable onPress={() => onPressEvent(event)} accessibilityRole="button" accessibilityLabel={event.title}>
        <View style={[styles.cover, { height: coverH, backgroundColor: tokens.elevated }]}>
          {event.coverImageUrl ? (
            <Image
              source={{ uri: event.coverImageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              // Fade in instead of popping in while the card is sliding.
              transition={180}
              cachePolicy="memory-disk"
              recyclingKey={event.id}
            />
          ) : (
            <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
        </View>

        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={{ color: tokens.accent }}>{relativeWhen(event.startDateTime)}</Text>
          <Text style={{ color: tokens.textSecondary }}>{`  ·  ${shortPrice(event)}`}</Text>
          {place ? <Text style={{ color: tokens.textMuted }}>{`  ·  ${place}`}</Text> : null}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

export default React.memo(HeroCarousel);

function Dot({ index, scrollX, snap }: { index: number; scrollX: SharedValue<number>; snap: number }) {
  const tokens = useTokens();
  // The focused dot stretches into a pill and lights up in accent.
  const animated = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / snap - index);
    const t = interpolate(d, [0, 1], [1, 0], Extrapolation.CLAMP);
    return { width: 6 + t * 14, opacity: 0.25 + t * 0.75 };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: tokens.accent }, animated]} />;
}

const styles = StyleSheet.create({
  skeletonRow: { flexDirection: 'row', gap: GAP, paddingHorizontal: GUTTER, overflow: 'hidden' },
  cover: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  title: {
    marginTop: spacing[3],
    fontSize: typography.fontSize.lg,
    letterSpacing: -0.2,
    ...font('heading'),
  },
  meta: { marginTop: 3, fontSize: typography.fontSize.sm, ...font('medium') },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: spacing[4] },
  dot: { height: 6, borderRadius: 3 },
  empty: {
    borderRadius: borderRadius['2xl'],
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: typography.fontSize.lg, ...font('heading') },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
});
