import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarBlank, MagnifyingGlass, SlidersHorizontal, X } from '@unifesto/unicon/react-native';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import EventListCard, { EventListCardSkeleton, placeOf } from '../components/EventListCard';
import PosterCard, { PosterCardSkeleton } from '../components/home/PosterCard';
import { PRESET_ITEMS } from '../components/home/HomeHeader';
import { GUTTER } from '../components/home/Section';
import { HeaderMenu } from '../navigation/HeaderActions';
import Skeleton from '../components/Skeleton';
import useTopSpacing from '../hooks/useTopSpacing';
import { PRESETS, useEventsBrowse, type Preset } from '../hooks/useEventsBrowse';
import { countdownLabel, relativeWhen, shortPrice } from '../utils/eventFormat';
import type { Event } from '../lib/api/events';
import { coverOr, useDefaultImages } from '../lib/defaultImages';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const SEARCH_H = 52;

/**
 * Browse all published events, in Home's cosmos voice: a search field with the
 * quick-filter menu beside it (same as Home), category chips, then the top
 * result as a full poster and the rest as compact cards. While searching the
 * poster steps aside so results read as one even list.
 */
export default function EventsScreen() {
  const c = useCosmos();
  const router = useRouter();
  const defaults = useDefaultImages();
  const { width } = useWindowDimensions();
  const topSpacing = useTopSpacing(8);
  const params = useLocalSearchParams<{ category?: string; search?: string; preset?: string }>();
  const b = useEventsBrowse({ category: params.category, search: params.search, preset: params.preset });

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

  const openEvent = (e: Event) => router.push(`/event/${e.slug || e.id}`);
  const presetLabel = PRESETS.find((p) => p.key === b.preset)?.label;
  const featured = !b.loading && !b.query.trim() ? b.events[0] : undefined;
  const rest = b.loading ? [] : featured ? b.events.slice(1) : b.events;
  const posterWidth = width - GUTTER * 2;

  const chip = (key: string, label: string, active: boolean, onPress: () => void, dismissible = false) => (
    <Pressable
      key={key}
      onLayout={(e) => (chipX.current[key] = e.nativeEvent.layout.x)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={dismissible ? `${label}, remove filter` : label}
      style={({ pressed }) => [
        styles.chip,
        active ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.card, borderColor: c.border },
        { transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{label}</Text>
      {dismissible ? <X size={13} color={c.primaryFg} /> : null}
    </Pressable>
  );

  const header = (
    <View>
      <View style={styles.searchRow}>
        <View style={[styles.search, { borderColor: c.input, backgroundColor: c.card }]}>
          <MagnifyingGlass size={18} color={c.muted} />
          <TextInput
            value={b.query}
            onChangeText={b.setQuery}
            placeholder="Search events, spaces or cities"
            placeholderTextColor={c.muted}
            style={[styles.searchInput, { color: c.text }]}
            selectionColor={c.text}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="never"
            accessibilityRole="search"
          />
          {b.query.length > 0 ? (
            <Pressable onPress={() => b.setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <X size={16} color={c.soft} />
            </Pressable>
          ) : null}
        </View>
        <HeaderMenu
          title="Browse events"
          items={PRESET_ITEMS}
          onSelect={(id) => b.setPreset(b.preset === id ? null : (id as Preset))}
          label={presetLabel ? `Filter: ${presetLabel}` : 'Filter events'}
          trigger={<SlidersHorizontal size={20} color={b.preset ? c.primaryFg : c.text} />}
          triggerStyle={[
            styles.filter,
            b.preset ? { borderColor: c.primary, backgroundColor: c.primary } : { borderColor: c.input, backgroundColor: c.card },
          ]}
        />
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
          : [
              // The active quick filter rides first so it's visible and one tap to drop.
              presetLabel ? chip(`preset-${b.preset}`, presetLabel, true, () => b.setPreset(null), true) : null,
              ...b.categories.map((name) => chip(name, name, b.category === name, () => b.setCategory(name))),
            ]}
      </ScrollView>

      {featured ? (
        <View style={styles.featured}>
          <PosterCard
            width={posterWidth}
            title={featured.title}
            imageUrl={coverOr(defaults, featured.id, featured.coverImageUrl)}
            when={relativeWhen(featured.startDateTime)}
            where={placeOf(featured)}
            host={featured.space?.name}
            tag={countdownLabel(featured.startDateTime)}
            price={shortPrice(featured)}
            onPress={() => openEvent(featured)}
          />
        </View>
      ) : null}
    </View>
  );

  const empty = b.loading ? (
    <View style={styles.list}>
      {b.query.trim() ? null : (
        <View style={{ marginBottom: spacing[3] }}>
          <PosterCardSkeleton width={posterWidth} />
        </View>
      )}
      {[0, 1, 2, 3].map((i) => <EventListCardSkeleton key={i} />)}
    </View>
  ) : featured ? null : (
    <View style={[styles.prompt, { backgroundColor: c.raised }]}>
      {b.error ? (
        <CalendarBlank size={40} color={c.soft} weight="duotone" />
      ) : (
        <MagnifyingGlass size={40} color={c.soft} weight="duotone" />
      )}
      <Text style={[styles.promptTitle, { color: c.text }]}>
        {b.error ? "Couldn't load events" : b.filtered ? 'Nothing matches that' : 'No events yet'}
      </Text>
      <Text style={[styles.promptBody, { color: c.soft }]}>
        {b.error
          ? 'Check your connection and try again.'
          : b.filtered
            ? 'Try another word or a different filter.'
            : 'New events from spaces show up here.'}
      </Text>
      {b.error || b.filtered ? (
        <AuthButton
          label={b.error ? 'Try again' : 'Clear filters'}
          variant="secondary"
          onPress={b.error ? b.refresh : b.clearFilters}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <FlatList
        data={rest}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventListCard event={item} onPress={() => openEvent(item)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={b.loadingMore ? <ActivityIndicator color={c.text} style={{ marginTop: spacing[6] }} /> : null}
        ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 100 }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={b.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={b.refreshing}
            onRefresh={b.refresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: spacing[2] },
  search: {
    flex: 1,
    height: SEARCH_H,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...cosmosFont.body },
  filter: {
    width: SEARCH_H,
    height: SEARCH_H,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsWrap: { marginTop: spacing[4], marginBottom: spacing[5], marginHorizontal: -GUTTER },
  chips: { paddingHorizontal: GUTTER, gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  featured: { marginBottom: spacing[3] },
  list: { gap: spacing[3] },
  prompt: { marginTop: spacing[2], borderRadius: cosmosCardRadius, padding: spacing[6] },
  promptTitle: { marginTop: spacing[5], fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  promptBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
