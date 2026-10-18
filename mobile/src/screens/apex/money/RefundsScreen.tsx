import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTokens } from '../../../context/ThemeContext';
import useAnalyticsScreenTracking from '../../../hooks/useAnalyticsScreenTracking';
import { listRefunds, refundableBase } from '../../../lib/api/apexMoney';
import type { RefundRequest, RefundStatus } from '../../../lib/api/finance';
import SearchList from '../../../components/apex/SearchList';
import { ApexRow, shortDate } from '../../../components/apex/ApexRow';
import ChipPicker from '../../../components/manage/ChipPicker';
import ManageStats from '../../../components/manage/ManageStats';
import { refundStatus } from '../../../components/manage/FinanceRows';
import { inr } from '../../../utils/money';
import { spacing } from '../../../theme/spacing';

type Filter = RefundStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'PENDING_ADMIN', label: 'Waiting on me' },
  { value: 'PENDING_CURATOR', label: 'With curator' },
  { value: 'APPROVED', label: 'Refunded' },
  { value: 'REJECTED', label: 'Declined' },
  { value: 'REFUND_FAILED', label: 'Refund failed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'all', label: 'All' },
];

const who = (u?: { fullName: string | null; username: string | null }) => u?.fullName || (u?.username ? `@${u.username}` : 'Someone');

/** The list endpoint has no search, so a query filters one big page on the device (as on the web). */
const SEARCH_PAGE = 100;

const matches = (r: RefundRequest, q: string) =>
  [who(r.requestedBy), who(r.registration?.user), r.event?.title, r.event?.space?.name, r.reason].filter(Boolean).join(' ').toLowerCase().includes(q);

/**
 * Every refund request on the platform, not just the ones waiting on Unifesto:
 * filter by stage, search, and open one to decide or read its history.
 */
export default function RefundsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const [filter, setFilter] = useState<Filter>('PENDING_ADMIN');
  const [counts, setCounts] = useState<{ waiting: number; approved: number; declined: number } | null>(null);
  useAnalyticsScreenTracking('ApexRefunds');

  // Totals per stage for the tiles; refreshed whenever we come back from a decision.
  useFocusEffect(
    useCallback(() => {
      void Promise.all((['PENDING_ADMIN', 'APPROVED', 'REJECTED'] as const).map((status) => listRefunds({ status, limit: 1 }))).then(
        ([w, a, d]) => {
          const n = (r: typeof w) => (r.ok ? r.data.pagination.total : 0);
          setCounts({ waiting: n(w), approved: n(a), declined: n(d) });
        },
      );
    }, []),
  );

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const status = filter === 'all' ? undefined : filter;
      const q = search.trim().toLowerCase();
      if (q) {
        if (page > 1) return { ok: true as const, data: { items: [], total: 0 } };
        const r = await listRefunds({ status, page: 1, limit: SEARCH_PAGE });
        if (!r.ok) return r;
        const hits = r.data.requests.filter((x) => matches(x, q));
        return { ok: true as const, data: { items: hits, total: hits.length } };
      }
      const r = await listRefunds({ status, page });
      return r.ok ? { ok: true as const, data: { items: r.data.requests, total: r.data.pagination.total } } : r;
    },
    [filter],
  );

  return (
    <SearchList<RefundRequest>
      placeholder="Event, person or reason"
      noun={['request', 'requests']}
      fetchPage={fetchPage}
      keyOf={(r) => r.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          <ManageStats
            loading={!counts}
            stats={[
              { label: 'Waiting on me', value: counts?.waiting ?? 0 },
              { label: 'Refunded', value: counts?.approved ?? 0 },
              { label: 'Declined', value: counts?.declined ?? 0 },
            ]}
          />
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
        </View>
      }
      renderItem={(r) => {
        const s = refundStatus(r.status, tokens);
        const amount =
          r.status === 'APPROVED'
            ? inr(r.approvedAmount ?? r.cashRefunded)
            : r.requestedAmount != null
              ? inr(r.requestedAmount)
              : inr(r.maxRefundable ?? refundableBase(r.registration));
        return (
          <ApexRow
            title={who(r.registration?.user)}
            meta={[r.event?.title, filter === 'all' || filter === 'PENDING_CURATOR' ? s.text : null, shortDate(r.createdAt), r.reason].filter(Boolean).join('  ·  ')}
            value={amount}
            valueColor={s.color}
            onPress={() => router.push(`/manage/refund/${r.id}`)}
          />
        );
      }}
    />
  );
}
