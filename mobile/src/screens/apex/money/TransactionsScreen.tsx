import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { getTransactions, type LedgerTransaction, type TransactionsPage, type TxnStatus } from '../../../lib/api/apexMoney';
import SearchList from '../../../components/apex/SearchList';
import { ApexRow, shortDate } from '../../../components/apex/ApexRow';
import ChipPicker from '../../../components/manage/ChipPicker';
import ManageStats from '../../../components/manage/ManageStats';
import { inr, inrShort } from '../../../utils/money';
import { spacing } from '../../../theme/spacing';
import { type Cosmos, useCosmos } from '../../../theme/cosmos';

const FILTERS: { value: TxnStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'PARTIALLY_REFUNDED', label: 'Partial refund' },
];

export function txnStatus(s: TxnStatus, c: Cosmos) {
  switch (s) {
    case 'PAID':
      return { text: 'Paid', color: c.success };
    case 'PENDING':
      return { text: 'Pending', color: c.warn };
    case 'FAILED':
      return { text: 'Failed', color: c.danger };
    case 'REFUNDED':
      return { text: 'Refunded', color: c.muted };
    default:
      return { text: 'Partial refund', color: c.warn };
  }
}

export const payerName = (u: { fullName: string | null; username: string | null; email?: string | null }) =>
  u.fullName || (u.username ? `@${u.username}` : u.email || 'Unknown');

/** Every payment on the platform: search by reference, event or payer. */
export default function TransactionsScreen() {
  const router = useRouter();
  const c = useCosmos();
  const [status, setStatus] = useState<TxnStatus | 'all'>('all');
  const [summary, setSummary] = useState<TransactionsPage['summary'] | null>(null);

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await getTransactions({ search, page, status: status === 'all' ? undefined : status });
      if (!r.ok) return r;
      if (page === 1) setSummary(r.data.summary);
      return { ok: true as const, data: { items: r.data.transactions, total: r.data.pagination.total } };
    },
    [status],
  );

  return (
    <SearchList<LedgerTransaction>
      placeholder="Reference, event or payer"
      noun={['transaction', 'transactions']}
      fetchPage={fetchPage}
      keyOf={(t) => t.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          <ManageStats
            loading={!summary}
            stats={[
              { label: 'Gross volume', value: inrShort(summary?.grossVolume ?? 0) },
              { label: 'Successful', value: summary?.successful ?? 0 },
              { label: 'Failed', value: summary?.failed ?? 0 },
            ]}
          />
          <ChipPicker options={FILTERS} value={status} onChange={(v) => v && setStatus(v)} />
        </View>
      }
      renderItem={(t) => {
        const s = txnStatus(t.paymentStatus, c);
        return (
          <ApexRow
            title={payerName(t.user)}
            meta={[t.event.title, t.event.space?.name, shortDate(t.paidAt ?? t.registeredAt), t.paymentStatus === 'PAID' ? null : s.text]
              .filter(Boolean)
              .join('  ·  ')}
            value={inr(t.totalAmount)}
            valueColor={t.paymentStatus === 'PAID' ? c.text : s.color}
            onPress={() => router.push(`/apex/money/transactions/${t.id}`)}
          />
        );
      }}
    />
  );
}
