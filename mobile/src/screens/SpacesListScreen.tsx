import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MagnifyingGlass, UsersThree, X } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { CardBackdrop } from '../components/ui/CardSurface';
import { useAuth } from '../context/AuthContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { SpaceCard, SpaceCardSkeleton } from '../components/home/SpaceCards';
import { Button } from '../components/ui';
import { getAllSpaces, getSpaceById, getUserSpaces, Space } from '../lib/api/spaces';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const GAP = spacing[3];
/** Spaces fetched per page — shared by the server-paginated catalogue and the
 *  client-paginated "my circles" list. */
const PAGE_SIZE = 12;

/**
 * Two modes on one screen:
 *  - "My circles" (`?mine=true`): spaces the user belongs to — one fetch,
 *    searched and paged client-side (the endpoint returns an unpaginated array).
 *  - Catalogue: every public space, searched and paged by the server.
 * Both render as a 2-column grid that loads more as you scroll.
 */
export default function SpacesListScreen() {
  const tokens = useTokens();
  const { token } = useAuth();
  const router = useRouter();
  const topSpacing = useTopSpacing();
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.floor((screenW - GUTTER * 2 - GAP) / 2);

  const { search: paramSearch, mine: paramMine } = useLocalSearchParams<{ search?: string; mine?: string }>();
  const isMine = paramMine === 'true' || paramMine === '1';

  const [searchQuery, setSearchQuery] = useState(paramSearch || '');
  const mineAllRef = useRef<Space[]>([]);
  const mineLoadedRef = useRef(false);
  const didInitialLoadRef = useRef(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [parentSpaceNames, setParentSpaceNames] = useState<Record<string, string>>({});

  // Resolve names for sub-spaces so cards can say "Part of <parent>".
  const fetchParentSpaceNames = async (items: Space[]) => {
    const ids = Array.from(
      new Set(items.map((s) => s.parentSpaceId).filter((id): id is string => !!id && !parentSpaceNames[id])),
    );
    if (ids.length === 0) return;
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return { id, name: (await getSpaceById(id)).name as string };
        } catch {
          return { id, name: null };
        }
      }),
    );
    const map: Record<string, string> = {};
    results.forEach(({ id, name }) => {
      if (name) map[id] = name;
    });
    setParentSpaceNames((prev) => ({ ...prev, ...map }));
  };

  const loadSpaces = useCallback(
    async (pageNum: number = 1, mode: 'initial' | 'refresh' | 'more' = 'initial') => {
      try {
        if (mode === 'refresh') setRefreshing(true);
        else if (mode === 'more') setLoadingMore(true);
        else setLoading(true);

        if (isMine) {
          if (!token) {
            setSpaces([]);
            setHasMore(false);
            return;
          }
          if (!mineLoadedRef.current || mode === 'refresh') {
            mineAllRef.current = await getUserSpaces(token);
            mineLoadedRef.current = true;
          }
          const q = searchQuery.trim().toLowerCase();
          const filtered = q
            ? mineAllRef.current.filter((s) => s.name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q))
            : mineAllRef.current;
          const items = filtered.slice(0, pageNum * PAGE_SIZE);
          setSpaces(items);
          setPage(pageNum);
          setHasMore(items.length < filtered.length);
          fetchParentSpaceNames(items);
          return;
        }

        const response = await getAllSpaces({
          page: pageNum,
          limit: PAGE_SIZE,
          ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        });
        const data: Space[] = response?.spaces || [];
        setSpaces((prev) => (pageNum > 1 ? [...prev, ...data.filter((d) => !prev.some((p) => p.id === d.id))] : data));
        setPage(pageNum);
        setHasMore(
          response?.pagination ? pageNum < response.pagination.totalPages : data.length >= PAGE_SIZE,
        );
        fetchParentSpaceNames(data);
      } catch (error) {
        if (__DEV__) console.error('Error loading spaces:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchQuery, isMine, token],
  );

  // Initial load — in "my circles" mode wait for the auth token to resolve
  // from storage, otherwise it would load empty and never retry.
  useEffect(() => {
    if (didInitialLoadRef.current) return;
    if (isMine && !token) return;
    didInitialLoadRef.current = true;
    loadSpaces(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMine, token]);

  // Debounced search.
  useEffect(() => {
    if (!didInitialLoadRef.current) return;
    const timer = setTimeout(() => loadSpaces(1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const onEndReached = () => {
    if (!loading && !loadingMore && hasMore) loadSpaces(page + 1, 'more');
  };

  const header = (
    <View style={styles.search}>
      <CardBackdrop shape={styles.search} />
      <MagnifyingGlass size={18} color={tokens.textMuted} />
      <TextInput
        style={[styles.searchInput, { color: tokens.text }]}
        placeholder={isMine ? 'Search my circles' : 'Search spaces'}
        placeholderTextColor={tokens.textMuted}
        selectionColor={tokens.accent}
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      {searchQuery.length > 0 ? (
        <Pressable onPress={() => setSearchQuery('')} hitSlop={10} accessibilityLabel="Clear search">
          <X size={16} color={tokens.textMuted} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );

  const empty = (() => {
    const searching = !!searchQuery.trim();
    const title = searching ? 'No matches' : isMine ? 'No circles yet' : 'No spaces yet';
    const body = searching
      ? `Nothing matches “${searchQuery.trim()}”.`
      : isMine
        ? 'Spaces you join show up here.'
        : 'Check back soon for new spaces.';
    return (
      <View style={styles.empty}>
        <UsersThree size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
        <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>{body}</Text>
        {isMine && !searching ? (
          <Button label="Explore spaces" onPress={() => router.push('/spaces')} style={{ marginTop: spacing[5], alignSelf: 'center' }} />
        ) : null}
      </View>
    );
  })();

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      data={loading ? [] : spaces}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ marginBottom: spacing[5] }}
      renderItem={({ item }) => (
        <SpaceCard
          space={item}
          width={cardW}
          context={item.parentSpaceId && parentSpaceNames[item.parentSpaceId] ? `Part of ${parentSpaceNames[item.parentSpaceId]}` : null}
          onPress={() => router.push(`/space/${item.id}`)}
        />
      )}
      ListEmptyComponent={
        loading ? (
          <View style={styles.skeletonGrid}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SpaceCardSkeleton key={i} width={cardW} />
            ))}
          </View>
        ) : (
          empty
        )
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[6] }} /> : null}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadSpaces(1, 'refresh')}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100, gap: GAP },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 48,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
  },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...font() },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: spacing[4] },
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
