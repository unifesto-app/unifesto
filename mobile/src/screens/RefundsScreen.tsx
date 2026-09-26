import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getRefundQueue, type RefundRequest, type RefundStatus } from '../lib/api/finance';
import { RefundRow } from '../components/manage/FinanceRows';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const PAGE_SIZE = 30;

const TABS: { key: RefundStatus; label: string }[] = [
  { key: 'PENDING_CURATOR', label: 'Review' },
  { key: 'PENDING_ADMIN', label: 'Forwarded' },
  { key: 'APPROVED', label: 'Refunded' },
  { key: 'REJECTED', label: 'Rejected' },
];

const EMPTY: Record<RefundStatus, string> = {
  PENDING_CURATOR: 'Nothing waiting on you.',
  PENDING_ADMIN: 'Nothing with Unifesto right now.',
  APPROVED: 'No refunds paid yet.',
  REJECTED: 'No rejected requests.',
};

/**
 * Refund requests on this space's events. Two-stage flow: you check the
 * request and forward it (or reject with a reason); Unifesto then approves and
 * sends the money.
 */
export default function RefundsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [status, setStatus] = useState<RefundStatus>('PENDING_CURATOR');
  const [rows, setRows] = useState<RefundRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  useAnalyticsScreenTracking('Refunds');

  const fetchPage = useCallback(
    async (next: number) => {
      if (!spaceId) return;
      const gen = next === 1 ? ++generation.current : generation.current;
      const res = await getRefundQueue(spaceId, { status, page: next, limit: PAGE_SIZE });
      if (gen !== generation.current) return;
      if (!res.ok) {
        setError(res.denied ? 'Only Space admins can review refunds.' : res.message);
        return;
      }
      setError('');
      setTotal(res.data.pagination?.total ?? 0);
      setPage(next);
      setRows((prev) => (next === 1 ? res.data.requests : [...prev, ...res.data.requests]));
    },
    [spaceId, status],
  );

  // Reload on tab change and whenever we come back from a review.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchPage(1).finally(() => setLoading(false));
    }, [fetchPage]),
  );

  const loadMore = async () => {
    if (loading || loadingMore || rows.length >= total) return;
    setLoadingMore(true);
    await fetchPage(page + 1);
    setLoadingMore(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPage(1);
    setRefreshing(false);
  };

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
      data={loading || error ? [] : rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View style={{ paddingTop: topSpacing }}>
          <SegmentedTabs tabs={TABS} value={status} onChange={setStatus} />
          {!loading && !error && total > 0 ? (
            <Text style={[styles.count, { color: tokens.textMuted }]}>
              {total} {total === 1 ? 'request' : 'requests'}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
        ) : (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>{error || EMPTY[status]}</Text>
        )
      }
      ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
      renderItem={({ item }) => <RefundRow refund={item} onPress={() => router.push(`/manage/refund/${item.id}`)} />}
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
  count: { marginTop: spacing[4], marginBottom: spacing[1], fontSize: typography.fontSize.xs, ...font('medium') },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
