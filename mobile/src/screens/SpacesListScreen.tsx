import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UsersThree } from '@unifesto/unicon/react-native';
import { CosmosList } from '../components/ui/CosmosScreen';
import SearchField from '../components/manage/SearchField';
import { GUTTER } from '../components/home/Section';
import { SpaceCard, SpaceCardSkeleton } from '../components/home/SpaceCards';
import { getAllSpaces, getSpaceById, Space } from '../lib/api/spaces';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const GAP = spacing[3];
/** Spaces fetched per page. */
const PAGE_SIZE = 12;

/**
 * The catalogue: every public space, searched and paged by the server, as a
 * 2-column grid that loads more as you scroll. My circles (`?mine=true`) is
 * its own screen, MyCirclesScreen.
 */
export default function SpacesListScreen() {
  const c = useCosmos();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.floor((screenW - GUTTER * 2 - GAP) / 2);

  const { search: paramSearch } = useLocalSearchParams<{ search?: string }>();

  const [searchQuery, setSearchQuery] = useState(paramSearch || '');
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
    [searchQuery],
  );

  useEffect(() => {
    didInitialLoadRef.current = true;
    loadSpaces(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const header = <SearchField placeholder="Search spaces" value={searchQuery} onChangeText={setSearchQuery} />;

  const empty = (() => {
    const searching = !!searchQuery.trim();
    const title = searching ? 'No matches' : 'No spaces yet';
    const body = searching ? `Nothing matches “${searchQuery.trim()}”.` : 'Check back soon for new spaces.';
    return (
      <View style={[styles.empty, { backgroundColor: c.raised }]}>
        <UsersThree size={40} color={c.muted} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.emptyBody, { color: c.soft }]}>{body}</Text>
      </View>
    );
  })();

  return (
    <CosmosList
      data={loading ? [] : spaces}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
      refreshing={refreshing}
      onRefresh={() => loadSpaces(1, 'refresh')}
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
      ListFooterComponent={loadingMore ? <ActivityIndicator color={c.text} style={{ marginTop: spacing[6] }} /> : null}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: GAP },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { alignItems: 'center', padding: spacing[6], borderRadius: cosmosCardRadius },
  emptyTitle: { marginTop: spacing[3], fontSize: typography.fontSize.base, textAlign: 'center', ...cosmosFont.strong },
  emptyBody: {
    marginTop: 6,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...cosmosFont.body,
  },
});
