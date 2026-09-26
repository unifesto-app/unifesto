import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { Event } from '../lib/api/events';
import { getFavorites } from '../lib/api/favorites';
import FavoriteButton from '../components/FavoriteButton';
import Skeleton from '../components/Skeleton';
import { Button } from '../components/ui';
import useTopSpacing from '../hooks/useTopSpacing';
import { relativeWhen, shortPrice } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
// Event banners are 4:3.
const THUMB_W = 96;
const THUMB_H = 72;

export default function FavoritesScreen() {
  const router = useRouter();
  const tokens = useTokens();
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

  // Only events still favourited, so un-hearting a row removes it live (the
  // context updates favoriteIds optimistically). Split by date: what's coming
  // up (soonest first) and what's already happened (most recent first).
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const saved = events.filter((e) => favoriteIds.has(e.id));
    const at = (e: Event) => new Date(e.startDateTime).getTime();
    return {
      upcoming: saved.filter((e) => at(e) >= now).sort((a, b) => at(a) - at(b)),
      past: saved.filter((e) => at(e) < now).sort((a, b) => at(b) - at(a)),
    };
  }, [events, favoriteIds]);

  const container = (children: React.ReactNode, center = false) => (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }, center && styles.centerContent]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        isAuthenticated ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );

  const emptyState = (title: string, body: string, cta: { label: string; onPress: () => void }) =>
    container(
      <View style={styles.empty}>
        <Heart size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
        <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>{body}</Text>
        <Button label={cta.label} onPress={cta.onPress} style={{ marginTop: spacing[5], alignSelf: 'center' }} />
      </View>,
      true,
    );

  if (loading) {
    return container(
      [0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.md} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="85%" height={14} borderRadius={6} />
            <Skeleton width="50%" height={12} borderRadius={6} />
          </View>
        </View>
      )),
    );
  }

  if (!isAuthenticated) {
    return emptyState('Sign in to save events', 'Heart events to find them later. They sync across your devices.', {
      label: 'Sign in',
      onPress: () => router.push('/login'),
    });
  }

  if (upcoming.length + past.length === 0) {
    return emptyState('Nothing saved yet', 'Tap the heart on any event to keep it here.', {
      label: 'Browse events',
      onPress: () => router.push('/events'),
    });
  }

  const renderRow = (item: Event, isPast: boolean) => {
    const place = item.venueName || item.city || (item.type === 'ONLINE' ? 'Online' : null);
    return (
      <Animated.View key={item.id} entering={FadeIn} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(220)}>
        <Pressable
          onPress={() => router.push(`/event/${item.slug || item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={[styles.thumb, { backgroundColor: tokens.elevated }, isPast && { opacity: 0.55 }]}>
            {item.coverImageUrl ? (
              <Image source={{ uri: item.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
          </View>
          <View style={[styles.info, isPast && { opacity: 0.6 }]}>
            <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[styles.meta, { color: isPast ? tokens.textMuted : tokens.accent }]} numberOfLines={1}>
              {relativeWhen(item.startDateTime)}
            </Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
              {[place, isPast ? null : shortPrice(item)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <FavoriteButton eventId={item.id} size={22} />
        </Pressable>
      </Animated.View>
    );
  };

  return container(
    <>
      {upcoming.length > 0 ? (
        <Animated.View layout={LinearTransition.duration(220)}>
          <Text style={[styles.section, { color: tokens.textMuted }]}>Upcoming</Text>
          {upcoming.map((e) => renderRow(e, false))}
        </Animated.View>
      ) : null}
      {past.length > 0 ? (
        <Animated.View layout={LinearTransition.duration(220)} style={upcoming.length > 0 && { marginTop: spacing[6] }}>
          <Text style={[styles.section, { color: tokens.textMuted }]}>Past</Text>
          {past.map((e) => renderRow(e, true))}
        </Animated.View>
      ) : null}
    </>,
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  centerContent: { flexGrow: 1, justifyContent: 'center' },
  section: { fontSize: typography.fontSize.sm, marginTop: spacing[4], marginBottom: spacing[2], ...font('semibold') },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.md, overflow: 'hidden' },
  info: { flex: 1, gap: 3 },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, ...font() },
  empty: { alignItems: 'center', paddingHorizontal: spacing[4], paddingBottom: spacing[16] },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, textAlign: 'center', ...font('heading') },
  emptyBody: {
    marginTop: 6,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...font(),
  },
});
