import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bank, CurrencyInr, Plus } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { deleteBankAccount, describeAccount, getMyBankAccounts, type BankAccount } from '../lib/api/finance';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import type { Tokens } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;

function accountStatus(a: BankAccount, tokens: Tokens) {
  if (a.status === 'VERIFIED') return { text: a.isPrimary ? 'Verified · Primary' : 'Verified', color: tokens.success };
  if (a.status === 'REJECTED') return { text: 'Rejected', color: tokens.danger };
  return { text: 'Being verified', color: tokens.warning };
}

/**
 * My payout methods and their verification state. Add a bank account here
 * (Unifesto verifies it before any money is sent) or remove one; there is no
 * edit, a wrong account is removed and added again.
 */
export default function PayoutAccountsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [removing, setRemoving] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('PayoutAccounts');

  const load = useCallback(async () => {
    const res = await getMyBankAccounts();
    if (res.ok) {
      setAccounts(res.data);
      setError('');
    } else {
      setError(res.message);
      setAccounts((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (a: BankAccount) =>
    AppAlert.alert(`Remove ${describeAccount(a)}?`, 'Events routed to it go back to your primary account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(a.id);
          const res = await deleteBankAccount(a.id);
          setRemoving(null);
          if (!res.ok) {
            AppAlert.alert("Couldn't remove", res.message);
            return;
          }
          await load();
        },
      },
    ]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!accounts) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
      }
    >
      <Text style={[styles.intro, { color: tokens.textMuted }]}>
        Where payouts are sent. These are mine; other Space admins' verified accounts can also be picked when requesting a payout.
      </Text>

      <SettingsGroup title="My accounts">
        {error ? (
          <SettingsRow label={error} />
        ) : accounts.length === 0 ? (
          <SettingsRow label="No payout accounts yet" />
        ) : (
          accounts.map((a) => {
            const s = accountStatus(a, tokens);
            return (
              <View key={a.id} style={styles.row}>
                <View style={styles.icon}>
                  {a.methodType === 'UPI' ? (
                    <CurrencyInr size={ICON} color={tokens.accent} weight="fill" />
                  ) : (
                    <Bank size={ICON} color={tokens.accent} weight="fill" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
                    {describeAccount(a)}
                  </Text>
                  <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
                    {a.accountHolderName}
                    {a.ifscCode ? `  ·  ${a.ifscCode}` : ''}
                  </Text>
                  {a.status === 'REJECTED' && a.rejectionReason ? (
                    <Text style={[styles.sub, { color: tokens.danger }]}>{a.rejectionReason}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: spacing[2] }}>
                  <Text style={[styles.status, { color: s.color }]}>{s.text}</Text>
                  {removing === a.id ? (
                    <ActivityIndicator size="small" color={tokens.danger} />
                  ) : (
                    <Pressable onPress={() => remove(a)} hitSlop={8} accessibilityLabel={`Remove ${describeAccount(a)}`}>
                      <Text style={[styles.status, { color: tokens.danger }]}>Remove</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon={<Plus size={ICON} color={tokens.accent} weight="bold" />}
          label="Add bank account"
          onPress={() => router.push('/manage/add-payout-account')}
        />
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 64 },
  icon: { width: 30, alignItems: 'center' },
  name: { fontSize: typography.fontSize.base, ...font('medium') },
  sub: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  status: { fontSize: typography.fontSize.xs, ...font('semibold') },
});
