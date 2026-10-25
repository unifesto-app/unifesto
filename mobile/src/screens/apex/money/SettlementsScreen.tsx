import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../../../components/ui/RefreshControl';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTokens } from '../../../context/ThemeContext';
import useTopSpacing from '../../../hooks/useTopSpacing';
import type { AdminPayout, PayoutStatus } from '../../../lib/api/apex';
import { listPayouts } from '../../../lib/api/apexMoney';
import { describeAccount } from '../../../lib/api/finance';
import { openPayout, organiserName } from '../../../lib/apexRequests';
import { ApexRow, shortDate } from '../../../components/apex/ApexRow';
import ChipPicker from '../../../components/manage/ChipPicker';
import ManageStats from '../../../components/manage/ManageStats';
import { payoutStatus } from '../../../components/manage/FinanceRows';
import { inr, inrShort } from '../../../utils/money';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { font } from '../../../theme/fontHelpers';

const GUTTER = spacing[6];
const OWED: PayoutStatus[] = ['PENDING', 'PROCESSING'];

type Filter = 'all' | 'owed' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owed', label: 'Queued' },
  { value: 'COMPLETED', label: 'Settled' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** Walk every page; payout volume is roughly one per event, so this stays cheap. */
async function fetchAllPayouts() {
  const first = await listPayouts({ page: 1 });
  if (!first.ok) return first;
  const { payouts, pagination } = first.data;
  if (pagination.totalPages <= 1) return { ok: true as const, data: payouts };
  const rest = await Promise.all(Array.from({ length: pagination.totalPages - 1 }, (_, i) => listPayouts({ page: i + 2 })));
  const all = [...payouts];
  for (const r of rest) {
    if (!r.ok) return r;
    all.push(...r.data.payouts);
  }
  return { ok: true as const, data: all };
}

/**
 * Settlements across the platform: what's queued for organisers, what went out
 * this month, and every transfer with its UTR. Tap one to settle or cancel it.
 */
export default function SettlementsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [payouts, setPayouts] = useState<AdminPayout[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchAllPayouts();
    if (res.ok) {
      setPayouts(res.data);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const summary = useMemo(() => {
    const now = new Date();
    let queued = 0;
    let settled = 0;
    let thisMonth = 0;
    for (const p of payouts ?? []) {
      const n = Number(p.netAmount);
      if (OWED.includes(p.status)) queued += n;
      if (p.status === 'COMPLETED') {
        settled += n;
        const d = p.completedAt ? new Date(p.completedAt) : null;
        if (d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) thisMonth += n;
      }
    }
    return { queued, settled, thisMonth };
  }, [payouts]);

  const rows = useMemo(() => {
    const list = (payouts ?? []).filter((p) =>
      filter === 'all' ? true : filter === 'owed' ? OWED.includes(p.status) : p.status === filter,
    );
    const when = (p: AdminPayout) => new Date(p.completedAt ?? p.createdAt).getTime();
    return list.sort((a, b) => when(b) - when(a));
  }, [payouts, filter]);

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
      data={payouts ? rows : []}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View style={{ paddingTop: topSpacing, gap: spacing[4] }}>
          <ManageStats
            loading={!payouts && !error}
            stats={[
              { label: 'Queued', value: inrShort(summary.queued) },
              { label: 'This month', value: inrShort(summary.thisMonth) },
              { label: 'Settled', value: inrShort(summary.settled) },
            ]}
          />
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
          {error ? <Text style={[styles.empty, { color: tokens.danger, marginTop: 0 }]}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !payouts && !error ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
        ) : payouts ? (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>Nothing here.</Text>
        ) : null
      }
      ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
      renderItem={({ item: p }) => {
        const s = payoutStatus(p.status, tokens);
        const to = p.bankAccount ? describeAccount(p.bankAccount) : null;
        return (
          <ApexRow
            title={p.event?.title ?? p.session?.title ?? 'Event'}
            meta={[organiserName(p), shortDate(p.completedAt ?? p.createdAt), p.utr ? `UTR ${p.utr}` : to, p.status === 'COMPLETED' ? null : s.text]
              .filter(Boolean)
              .join('  ·  ')}
            value={inr(p.netAmount)}
            valueColor={p.status === 'COMPLETED' ? tokens.text : s.color}
            onPress={() => router.push(openPayout(p) as never)}
          />
        );
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
