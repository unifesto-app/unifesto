import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getRefundQueue, type RefundRequest, type RefundStatus } from '../lib/api/finance';
import { RefundRow } from '../components/manage/FinanceRows';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
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
  PROCESSING: 'Nothing being processed.',
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
  const c = useCosmos();
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

  const data = loading || error ? [] : rows;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <FlatList
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={styles.content}
        data={data}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={{ paddingTop: topSpacing }}>
            <SegmentedTabs tabs={TABS} value={status} onChange={setStatus} />
            {!loading && !error && total > 0 ? (
              <Text style={[styles.count, { color: c.muted }]} accessibilityRole="header">
                {total} {total === 1 ? 'request' : 'requests'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
          ) : (
            <View style={[styles.empty, { backgroundColor: c.raised }]}>
              <Text style={[styles.emptyText, { color: c.soft }]}>{error || EMPTY[status]}</Text>
            </View>
          )
        }
        // One card for the queue: each request is a segment of it.
        renderItem={({ item, index }) => (
          <View style={cardSegment(c.raised, index, data.length)}>
            {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
            <RefundRow refund={item} onPress={() => router.push(`/manage/refund/${item.id}`)} />
          </View>
        )}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={c.text} style={{ marginVertical: spacing[4] }} /> : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  count: { marginTop: spacing[6], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
