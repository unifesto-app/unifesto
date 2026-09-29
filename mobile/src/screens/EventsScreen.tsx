import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarBlank, MagnifyingGlass, X } from 'phosphor-react-native';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '../context/ThemeContext';
import { CardBackdrop, LIQUID_GLASS } from '../components/ui/CardSurface';
import useTopSpacing from '../hooks/useTopSpacing';
import { useEventsBrowse } from '../hooks/useEventsBrowse';
import Skeleton from '../components/Skeleton';
import { relativeWhen, shortPrice } from '../utils/eventFormat';
import type { Event } from '../lib/api/events';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { coverOr, useDefaultImages } from '../lib/defaultImages';

const GUTTER = spacing[6];
// Event banners are 4:3; thumbs keep the ratio.
const THUMB_W = 112;
const THUMB_H = 84;

/** Browse all published events: search, category chips, paged list. */
export default function EventsScreen() {
  const { tokens, isDark } = useTheme();
  const defaults = useDefaultImages();
  const router = useRouter();
  const topSpacing = useTopSpacing(8);
  const params = useLocalSearchParams<{ category?: string; search?: string }>();
  const b = useEventsBrowse({ category: params.category, search: params.search });

  // Keep the selected chip in view (e.g. arriving from a Home category tile).
  const chipScroll = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  useEffect(() => {
    if (b.categoriesLoading) return;
    const t = setTimeout(() => {
      const x = chipX.current[b.category];
      if (x != null) chipScroll.current?.scrollTo({ x: Math.max(0, x - GUTTER), animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [b.category, b.categoriesLoading]);

  const header = (
    <View>
      <View style={styles.search}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
        <TextInput
          value={b.query}
          onChangeText={b.setQuery}
          placeholder="Search events, spaces or cities"
          placeholderTextColor={tokens.textMuted}
          style={[styles.searchInput, { color: tokens.text }]}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {b.query.length > 0 ? (
          <Pressable onPress={() => b.setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <X size={18} color={tokens.textSecondary} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={chipScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsWrap}
        contentContainerStyle={styles.chips}
      >
        {b.categoriesLoading
          ? [72, 96, 80, 104].map((w, i) => <Skeleton key={i} width={w} height={36} borderRadius={borderRadius.full} />)
          : b.categories.map((c) => {
              const active = b.category === c;
              return (
                <Pressable
                  key={c}
                  onLayout={(e) => (chipX.current[c] = e.nativeEvent.layout.x)}
                  onPress={() => b.setCategory(c)}
                  style={({ pressed }) => [
                    styles.chip,
                    LIQUID_GLASS
                      ? // opacity would break the glass, so press feedback is a scale
                        { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] }
                      : { backgroundColor: active ? tokens.text : tokens.elevated, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  {LIQUID_GLASS && !active ? (
                    <GlassView
                      glassEffectStyle="regular"
                      colorScheme={isDark ? 'dark' : 'light'}
                      isInteractive
                      style={[StyleSheet.absoluteFill, { borderRadius: borderRadius.full }]}
                      pointerEvents="none"
                    />
                  ) : null}
                  <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{c}</Text>
                </Pressable>
              );
            })}
      </ScrollView>
    </View>
  );

  const renderItem = ({ item }: { item: Event }) => {
    const where = item.venueName || item.city;
    return (
      <Pressable
        onPress={() => router.push(`/event/${item.slug || item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={[styles.thumb, { backgroundColor: tokens.elevated }]}>
          {coverOr(defaults, item.id, item.coverImageUrl) ? (
            <Image source={{ uri: coverOr(defaults, item.id, item.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
        </View>

        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
            {[relativeWhen(item.startDateTime), where].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.footer}>
            <Text style={[styles.meta, styles.host, { color: tokens.textMuted }]} numberOfLines={1}>
              {item.space?.name ?? ''}
            </Text>
            <Text style={[styles.price, { color: tokens.accent }]} numberOfLines={1}>{shortPrice(item)}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const empty = b.loading ? (
    <View style={{ gap: spacing[5] }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={THUMB_W} height={THUMB_H} borderRadius={borderRadius.lg} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="90%" height={15} borderRadius={6} />
            <Skeleton width="60%" height={12} borderRadius={6} />
            <Skeleton width="40%" height={12} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  ) : (
    <View style={styles.empty}>
      {b.error ? (
        <CalendarBlank size={48} color={tokens.textSecondary} weight="duotone" />
      ) : (
        <MagnifyingGlass size={48} color={tokens.textSecondary} weight="duotone" />
      )}
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>
        {b.error ? "Couldn't load events" : b.filtered ? 'Nothing matches that' : 'No events yet'}
      </Text>
      <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>
        {b.error
          ? 'Check your connection and try again.'
          : b.filtered
            ? 'Try another word or a different category.'
            : 'New events from spaces show up here.'}
      </Text>
      {b.error || b.filtered ? (
        <Text style={[styles.link, { color: tokens.accent }]} onPress={b.error ? b.refresh : b.clearFilters}>
          {b.error ? 'Try again' : 'Clear filters'}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <FlatList
        data={b.loading ? [] : b.events}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          b.loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[6] }} /> : null
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing[5] }} />}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: spacing[12] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={b.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={b.refreshing}
            onRefresh={b.refresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: 50,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
  },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...font() },
  chipsWrap: { marginTop: spacing[4], marginBottom: spacing[6], marginHorizontal: -GUTTER },
  chips: { paddingHorizontal: GUTTER, gap: spacing[2] },
  chip: { height: 36, paddingHorizontal: spacing[4], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...font('medium') },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: borderRadius.lg, overflow: 'hidden' },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, ...font() },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  host: { flex: 1 },
  price: { fontSize: typography.fontSize.sm, ...font('semibold') },
  empty: { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: spacing[4] },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, ...font('heading') },
  emptyBody: {
    marginTop: 6,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...font(),
  },
  link: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...font('semibold') },
});
