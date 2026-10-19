import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../ui/RefreshControl';
import { MagnifyingGlass } from '@unifesto/unicon/react-native';
import { useFocusEffect } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import type { Result } from '../../lib/api/apex';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

const GUTTER = spacing[6];

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
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
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

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
      data={loading || error ? [] : rows}
      keyExtractor={keyOf}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View style={{ paddingTop: topSpacing }}>
          <View style={styles.search}>
            <CardBackdrop shape={styles.search} />
            <MagnifyingGlass size={18} color={tokens.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={placeholder}
              placeholderTextColor={tokens.textMuted}
              style={[styles.input, { color: tokens.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
          {header}
          {!loading && !error && total > 0 ? (
            <Text style={[styles.count, { color: tokens.textMuted }]}>
              {total.toLocaleString('en-IN')} {total === 1 ? noun[0] : noun[1]}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
        ) : (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>{error || (query ? 'No matches.' : `No ${noun[1]}.`)}</Text>
        )
      }
      ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
      renderItem={({ item }) => renderItem(item)}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginVertical: spacing[4] }} /> : null}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], borderRadius: borderRadius.xl, height: 44 },
  input: { flex: 1, fontSize: typography.fontSize.base, ...font() },
  count: { marginTop: spacing[4], marginBottom: spacing[1], fontSize: typography.fontSize.xs, ...font('medium') },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
