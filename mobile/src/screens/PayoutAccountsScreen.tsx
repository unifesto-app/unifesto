import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bank, CurrencyInr, Plus } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { deleteBankAccount, describeAccount, getMyBankAccounts, type BankAccount } from '../lib/api/finance';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import AuthButton from '../components/auth/AuthButton';
import CosmosScreen from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos, type Cosmos } from '../theme/cosmos';

const ICON = 26;

function accountStatus(a: BankAccount, c: Cosmos) {
  if (a.status === 'VERIFIED') return { text: a.isPrimary ? 'Verified · Primary' : 'Verified', color: c.success };
  if (a.status === 'REJECTED') return { text: 'Rejected', color: c.danger };
  return { text: 'Being verified', color: c.warn };
}

/**
 * My payout methods and their verification state. Add a bank account here
 * (Unifesto verifies it before any money is sent) or remove one; there is no
 * edit, a wrong account is removed and added again.
 */
export default function PayoutAccountsScreen() {
  const router = useRouter();
  const c = useCosmos();
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
      <CosmosScreen>
        <View style={styles.pad}>
          <Skeleton width="100%" height={40} borderRadius={8} />
          <Skeleton width="100%" height={140} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={[styles.intro, { color: c.soft }]}>
        Where payouts are sent. These are mine; other Space admins' verified accounts can also be picked when requesting a payout.
      </Text>

      <Section title="My accounts" style={styles.firstSection}>
        <SettingsGroup style={styles.group}>
          {error ? (
            <SettingsRow label={error} />
          ) : accounts.length === 0 ? (
            <SettingsRow label="No payout accounts yet" />
          ) : (
            accounts.map((a) => {
              const s = accountStatus(a, c);
              return (
                <View key={a.id} style={styles.row}>
                  <View style={styles.icon}>
                    {a.methodType === 'UPI' ? (
                      <CurrencyInr size={ICON} color={c.text} weight="fill" />
                    ) : (
                      <Bank size={ICON} color={c.text} weight="fill" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                      {describeAccount(a)}
                    </Text>
                    <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>
                      {a.accountHolderName}
                      {a.ifscCode ? `  ·  ${a.ifscCode}` : ''}
                    </Text>
                    <Text style={[styles.sub, { color: s.color }]}>{s.text}</Text>
                    {a.status === 'REJECTED' && a.rejectionReason ? (
                      <Text style={[styles.sub, { color: c.danger }]}>{a.rejectionReason}</Text>
                    ) : null}
                  </View>
                  {removing === a.id ? (
                    <ActivityIndicator size="small" color={c.danger} />
                  ) : (
                    <Pressable
                      onPress={() => remove(a)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${describeAccount(a)}`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <Text style={[styles.remove, { color: c.danger }]}>Remove</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </SettingsGroup>
      </Section>

      <View style={[styles.pad, { marginTop: spacing[6] }]}>
        <AuthButton
          label="Add bank account"
          variant="secondary"
          icon={<Plus size={16} color={c.text} weight="bold" />}
          onPress={() => router.push('/manage/add-payout-account')}
        />
      </View>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  intro: { paddingHorizontal: GUTTER, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  firstSection: { marginTop: spacing[8] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 64 },
  icon: { width: 30, alignItems: 'center' },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sub: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  remove: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
