import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { CosmosList } from '../../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../../components/ui/CardSurface';
import { GUTTER } from '../../../components/home/Section';
import * as Clipboard from 'expo-clipboard';
import { getAllBankAccounts, setBankAccountStatus, type AdminBankAccount } from '../../../lib/api/apexMoney';
import type { BankAccountStatus } from '../../../lib/api/finance';
import ChipPicker from '../../../components/manage/ChipPicker';
import { shortDate } from '../../../components/apex/ApexRow';
import { Button } from '../../../components/ui';
import { AppAlert } from '../../../components/ui/AppAlert';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { type Cosmos, cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../../theme/cosmos';

type Filter = BankAccountStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'PENDING', label: 'To review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const statusLook = (s: BankAccountStatus, c: Cosmos) =>
  s === 'VERIFIED' ? { text: 'Verified', color: c.success } : s === 'PENDING' ? { text: 'To review', color: c.warn } : { text: 'Rejected', color: c.danger };

/**
 * Organiser payout accounts. A verified primary account is what lets payouts
 * queue for an event, so pending ones are the default view.
 */
export default function BankAccountsScreen() {
  const c = useCosmos();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [accounts, setAccounts] = useState<AdminBankAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const generation = useRef(0);

  const load = useCallback(
    async (next: number) => {
      const gen = next === 1 ? ++generation.current : generation.current;
      const res = await getAllBankAccounts({ page: next, status: filter === 'all' ? undefined : filter });
      if (gen !== generation.current) return;
      if (!res.ok) return setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
      setError('');
      setTotal(res.data.pagination.total);
      setPage(next);
      setAccounts((prev) => (next === 1 ? res.data.accounts : [...prev, ...res.data.accounts]));
    },
    [filter],
  );

  useEffect(() => {
    setLoading(true);
    setAccounts([]);
    void load(1).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loading || loadingMore || accounts.length >= total) return;
    setLoadingMore(true);
    await load(page + 1);
    setLoadingMore(false);
  };

  const decide = async (a: AdminBankAccount, status: 'VERIFIED' | 'REJECTED', why?: string) => {
    setBusy(a.id);
    const res = await setBankAccountStatus(a.id, status, why);
    setBusy(null);
    if (!res.ok) return AppAlert.alert("Couldn't update", res.message);
    setRejecting(null);
    setReason('');
    await load(1);
  };

  const confirmVerify = (a: AdminBankAccount) =>
    AppAlert.alert(
      'Verify this account?',
      `${a.methodType === 'UPI' ? `UPI ${a.upiId ?? ''}` : a.bankName ?? 'Bank account'} for ${a.accountHolderName}. Payouts can then be sent to it.`,
      [
        { text: 'Back', style: 'cancel' },
        { text: 'Verify', onPress: () => void decide(a, 'VERIFIED') },
      ],
    );

  const copy = (label: string, value?: string | null) => async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    AppAlert.alert('Copied', `${label} copied.`);
  };

  return (
    <CosmosList
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={styles.content}
      data={loading ? [] : accounts}
      keyExtractor={(a) => a.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
          {!loading && total > 0 ? <Text style={[styles.count, { color: c.muted }]}>{`${total} ${total === 1 ? 'account' : 'accounts'}`}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        ) : (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error || (filter === 'PENDING' ? 'Nothing to review.' : 'No accounts.')}</Text>
            {error ? <Button variant="secondary" label="Try again" onPress={() => void onRefresh()} style={{ marginTop: spacing[4] }} /> : null}
          </View>
        )
      }
      renderItem={({ item: a }) => {
        const s = statusLook(a.status, c);
        const owner = a.user?.fullName || (a.user?.username ? `@${a.user.username}` : 'Organiser');
        const upi = a.methodType === 'UPI';
        return (
          <View style={styles.card}>
            <CardBackdrop shape={styles.card} />
            <View style={styles.head}>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
                {upi ? 'UPI' : a.bankName || 'Bank account'}
                {a.isPrimary ? <Text style={{ color: c.muted }}>{'  ·  Primary'}</Text> : null}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={[styles.status, { color: s.color }]}>{s.text}</Text>
              </View>
            </View>
            <Text style={[styles.line, { color: c.soft }]}>{a.accountHolderName}</Text>
            {upi ? (
              <Text style={[styles.line, { color: c.soft }]} onPress={copy('UPI id', a.upiId)}>
                {a.upiId}
              </Text>
            ) : (
              <Text style={[styles.line, { color: c.soft }]} onPress={copy('Account number', a.accountNumber)}>
                {[a.accountNumber, a.ifscCode, a.accountType].filter(Boolean).join('  ·  ')}
              </Text>
            )}
            <Text style={[styles.meta, { color: c.muted }]}>
              {[owner, a.mobileNumber || a.user?.mobileNumber, `added ${shortDate(a.createdAt)}`].filter(Boolean).join('  ·  ')}
            </Text>
            {a.status === 'REJECTED' && a.rejectionReason ? <Text style={[styles.meta, { color: c.danger }]}>{a.rejectionReason}</Text> : null}

            {a.status === 'PENDING' ? (
              rejecting === a.id ? (
                <>
                  <TextInput
                    accessibilityLabel="Reason for rejecting"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Why (the organiser sees this)"
                    placeholderTextColor={c.muted}
                    autoFocus
                    style={[styles.input, { color: c.text, backgroundColor: c.tint }]}
                  />
                  <View style={styles.actions}>
                    <Button label="Back" variant="ghost" size="md" onPress={() => setRejecting(null)} style={{ flex: 1 }} />
                    <Button
                      label="Reject"
                      variant="danger"
                      size="md"
                      loading={busy === a.id}
                      onPress={() => void decide(a, 'REJECTED', reason.trim() || 'Details could not be verified.')}
                      style={{ flex: 1 }}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.actions}>
                  <Button
                    label="Reject"
                    variant="secondary"
                    size="md"
                    disabled={busy === a.id}
                    onPress={() => {
                      setReason('');
                      setRejecting(a.id);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button label="Verify" size="md" loading={busy === a.id} onPress={() => confirmVerify(a)} style={{ flex: 1 }} />
                </View>
              )
            ) : null}
          </View>
        );
      }}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={c.text} style={{ marginVertical: spacing[4] }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  count: { marginTop: spacing[4], fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  card: { marginTop: spacing[3], padding: spacing[4], borderRadius: cosmosCardRadius, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  title: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  line: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  meta: { marginTop: 4, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  input: { marginTop: spacing[3], height: 44, paddingHorizontal: spacing[3], borderRadius: cosmosRadius, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
});
