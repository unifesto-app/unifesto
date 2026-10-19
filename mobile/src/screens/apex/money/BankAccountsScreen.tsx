import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../../../components/ui/RefreshControl';
import * as Clipboard from 'expo-clipboard';
import { useTokens } from '../../../context/ThemeContext';
import useTopSpacing from '../../../hooks/useTopSpacing';
import { getAllBankAccounts, setBankAccountStatus, type AdminBankAccount } from '../../../lib/api/apexMoney';
import type { BankAccountStatus } from '../../../lib/api/finance';
import ChipPicker from '../../../components/manage/ChipPicker';
import { shortDate } from '../../../components/apex/ApexRow';
import { CardBackdrop } from '../../../components/ui/CardSurface';
import { Button } from '../../../components/ui';
import { AppAlert } from '../../../components/ui/AppAlert';
import type { Tokens } from '../../../theme/tokens';
import { borderRadius, spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { font } from '../../../theme/fontHelpers';

const GUTTER = spacing[6];

type Filter = BankAccountStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'PENDING', label: 'To review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const statusLook = (s: BankAccountStatus, tokens: Tokens) =>
  s === 'VERIFIED' ? { text: 'Verified', color: tokens.success } : s === 'PENDING' ? { text: 'To review', color: tokens.warning } : { text: 'Rejected', color: tokens.danger };

/**
 * Organiser payout accounts. A verified primary account is what lets payouts
 * queue for an event, so pending ones are the default view.
 */
export default function BankAccountsScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
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
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
      data={loading ? [] : accounts}
      keyExtractor={(a) => a.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ paddingTop: topSpacing }}>
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
          {!loading && total > 0 ? <Text style={[styles.count, { color: tokens.textMuted }]}>{`${total} ${total === 1 ? 'account' : 'accounts'}`}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
        ) : (
          <Text style={[styles.empty, { color: error ? tokens.danger : tokens.textMuted }]}>{error || (filter === 'PENDING' ? 'Nothing to review.' : 'No accounts.')}</Text>
        )
      }
      renderItem={({ item: a }) => {
        const s = statusLook(a.status, tokens);
        const owner = a.user?.fullName || (a.user?.username ? `@${a.user.username}` : 'Organiser');
        const upi = a.methodType === 'UPI';
        return (
          <View style={styles.card}>
            <CardBackdrop shape={styles.card} />
            <View style={styles.head}>
              <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
                {upi ? 'UPI' : a.bankName || 'Bank account'}
                {a.isPrimary ? <Text style={{ color: tokens.textMuted }}>{'  ·  Primary'}</Text> : null}
              </Text>
              <Text style={[styles.status, { color: s.color }]}>{s.text}</Text>
            </View>
            <Text style={[styles.line, { color: tokens.textSecondary }]}>{a.accountHolderName}</Text>
            {upi ? (
              <Text style={[styles.line, { color: tokens.textSecondary }]} onPress={copy('UPI id', a.upiId)}>
                {a.upiId}
              </Text>
            ) : (
              <Text style={[styles.line, { color: tokens.textSecondary }]} onPress={copy('Account number', a.accountNumber)}>
                {[a.accountNumber, a.ifscCode, a.accountType].filter(Boolean).join('  ·  ')}
              </Text>
            )}
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              {[owner, a.mobileNumber || a.user?.mobileNumber, `added ${shortDate(a.createdAt)}`].filter(Boolean).join('  ·  ')}
            </Text>
            {a.status === 'REJECTED' && a.rejectionReason ? <Text style={[styles.meta, { color: tokens.danger }]}>{a.rejectionReason}</Text> : null}

            {a.status === 'PENDING' ? (
              rejecting === a.id ? (
                <>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Why (the organiser sees this)"
                    placeholderTextColor={tokens.textMuted}
                    autoFocus
                    style={[styles.input, { color: tokens.text, backgroundColor: tokens.pressed }]}
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
      ListFooterComponent={loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginVertical: spacing[4] }} /> : null}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  count: { marginTop: spacing[4], fontSize: typography.fontSize.xs, ...font('medium') },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  card: { marginTop: spacing[3], padding: spacing[4], borderRadius: borderRadius.xl, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  title: { flex: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  status: { fontSize: typography.fontSize.sm, ...font('semibold') },
  line: { marginTop: 4, fontSize: typography.fontSize.sm, ...font('medium') },
  meta: { marginTop: 4, fontSize: typography.fontSize.xs, ...font() },
  input: { marginTop: spacing[3], height: 44, paddingHorizontal: spacing[3], borderRadius: borderRadius.lg, fontSize: typography.fontSize.sm, ...font() },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
});
