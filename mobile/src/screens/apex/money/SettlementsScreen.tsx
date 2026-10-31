import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CosmosList } from '../../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../../components/ui/CardSurface';
import { Button } from '../../../components/ui';
import { GUTTER } from '../../../components/home/Section';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../../../theme/cosmos';

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
  const c = useCosmos();
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

  const data = payouts ? rows : [];

  return (
    <CosmosList
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View style={{ gap: spacing[4], marginBottom: spacing[4] }}>
          <ManageStats
            loading={!payouts && !error}
            stats={[
              { label: 'Queued', value: inrShort(summary.queued), tone: 'ivory' },
              { label: 'This month', value: inrShort(summary.thisMonth), tone: 'ivory' },
              { label: 'Settled', value: inrShort(summary.settled), tone: 'ivory' },
            ]}
          />
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
          {error ? (
            <View style={styles.emptyCard}>
              <CardBackdrop shape={styles.emptyCard} />
              <Text style={[styles.empty, { color: c.soft }]}>{error}</Text>
              <Button variant="secondary" label="Try again" onPress={() => void onRefresh()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        !payouts && !error ? (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        ) : payouts ? (
          <View style={styles.emptyCard}>
            <CardBackdrop shape={styles.emptyCard} />
            <Text style={[styles.empty, { color: c.soft }]}>Nothing here.</Text>
          </View>
        ) : null
      }
      renderItem={({ item: p, index }) => {
        const s = payoutStatus(p.status, c);
        const to = p.bankAccount ? describeAccount(p.bankAccount) : null;
        return (
          <View style={cardSegment(c.raised, index, data.length)}>
            {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
            <ApexRow
            title={p.event?.title ?? 'Event'}
            meta={[organiserName(p), shortDate(p.completedAt ?? p.createdAt), p.utr ? `UTR ${p.utr}` : to, p.status === 'COMPLETED' ? null : s.text]
              .filter(Boolean)
              .join('  ·  ')}
            value={inr(p.netAmount)}
            valueColor={p.status === 'COMPLETED' ? c.ivory : s.color}
            onPress={() => router.push(openPayout(p) as never)}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  sep: { height: StyleSheet.hairlineWidth },
  emptyCard: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  empty: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
