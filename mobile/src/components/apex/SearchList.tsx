import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Result } from '../../lib/api/apex';
import { CosmosList } from '../ui/CosmosScreen';
import SearchField from '../manage/SearchField';
import { GUTTER } from '../home/Section';
import { CardBackdrop } from '../ui/CardSurface';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

export interface PageOf<T> {
  items: T[];
  total: number;
}

interface SearchListProps<T> {
  placeholder: string;
  /** Re-runs (from page 1) whenever this identity changes, e.g. a filter. */
  fetchPage: (search: string, page: number) => Promise<Result<PageOf<T>>>;
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactElement;
  /** Extra header content under the search box (filters). */
  header?: React.ReactNode;
  noun: [singular: string, plural: string];
  /** Shown on a 403. */
  deniedMessage?: string;
  /** Reload page 1 on returning to the screen, e.g. so read rows lose their dot. */
  refreshOnFocus?: boolean;
}

/** Debounced search box + paged, pull-to-refresh list for Apex lookups. */
export default function SearchList<T>({
  placeholder,
  fetchPage,
  keyOf,
  renderItem,
  header,
  noun,
  deniedMessage = 'Only Unifesto platform admins can see this.',
  refreshOnFocus,
}: SearchListProps<T>) {
  const c = useCosmos();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (next: number) => {
      // A new first page supersedes anything still in flight.
      const gen = next === 1 ? ++generation.current : generation.current;
      const res = await fetchPage(query, next);
      if (gen !== generation.current) return;
      if (!res.ok) {
        setError(res.denied ? deniedMessage : res.message);
        return;
      }
      setError('');
      setTotal(res.data.total);
      setPage(next);
      setRows((prev) => (next === 1 ? res.data.items : [...prev, ...res.data.items]));
    },
    [fetchPage, query, deniedMessage],
  );

  useEffect(() => {
    setLoading(true);
    void load(1).finally(() => setLoading(false));
  }, [load]);

  // The first focus is the mount, which the effect above already loads. Read
  // `load` through a ref so a filter change doesn't count as a focus.
  const focused = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  useFocusEffect(
    useCallback(() => {
      if (refreshOnFocus && focused.current) void loadRef.current(1);
      focused.current = true;
    }, [refreshOnFocus]),
  );

  const loadMore = async () => {
    if (loading || loadingMore || rows.length >= total) return;
    setLoadingMore(true);
    await load(page + 1);
    setLoadingMore(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  };

  const data = loading || error ? [] : rows;

  return (
    <CosmosList
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={keyOf}
      keyboardDismissMode="on-drag"
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <View>
          <SearchField value={search} onChangeText={setSearch} placeholder={placeholder} autoCorrect={false} autoCapitalize="none" />
          {header}
          {!loading && !error && total > 0 ? (
            <Text style={[styles.count, { color: c.muted }]} accessibilityRole="header">
              {total.toLocaleString('en-IN')} {total === 1 ? noun[0] : noun[1]}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        ) : (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error || (query ? 'No matches.' : `No ${noun[1]}.`)}</Text>
          </View>
        )
      }
      // One card for the list: each row is a segment of it.
      renderItem={({ item, index }) => (
        <View style={cardSegment(c.raised, index, data.length)}>
          {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
          {renderItem(item)}
        </View>
      )}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={c.text} style={{ marginVertical: spacing[4] }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  count: { marginTop: spacing[6], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
