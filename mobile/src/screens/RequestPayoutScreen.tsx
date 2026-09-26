import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, CircleIcon } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  describeAccount,
  getEligibleAccounts,
  getEventPayoutSummary,
  requestPayout,
  type EligibleAccount,
  type EventPayoutSummary,
} from '../lib/api/finance';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { inr } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

type Mode = 'full' | 'custom';
const MODES: { key: Mode; label: string }[] = [
  { key: 'full', label: 'Everything' },
  { key: 'custom', label: 'Custom amount' },
];

/**
 * Request a payout for one event. Shows the balance (net − already paid or
 * queued = available), lets the admin take all of it or part, and pick which
 * verified account it goes to (their own or another Space Admin's).
 */
export default function RequestPayoutScreen() {
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [summary, setSummary] = useState<EventPayoutSummary | null>(null);
  const [accounts, setAccounts] = useState<EligibleAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<Mode>('full');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('RequestPayout');

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    void Promise.all([getEventPayoutSummary(eventId), getEligibleAccounts(eventId)]).then(([s, a]) => {
      if (cancelled) return;
      setLoading(false);
      if (!s.ok) {
        setError(s.message);
        return;
      }
      setSummary(s.data);
      if (a.ok) {
        const list = a.data.accounts;
        setAccounts(list);
        // The event's saved account, else the creator's primary, else the first one.
        const preset = a.data.selectedBankAccountId;
        const pick =
          (preset && list.find((x) => x.id === preset)) || list.find((x) => x.isOwn && x.isPrimary) || list[0];
        setAccountId(pick?.id ?? '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>{error || 'Could not load this event’s balance.'}</Text>
      </View>
    );
  }

  const available = summary.available;
  const custom = Number(amount);
  const amountProblem =
    mode === 'custom'
      ? !amount.trim()
        ? 'Enter an amount.'
        : !/^\d+(\.\d{1,2})?$/.test(amount.trim()) || custom <= 0
          ? 'Enter an amount like 5000.'
          : custom > available
            ? `That's more than the ${inr(available)} available.`
            : null
      : null;
  const payAmount = mode === 'full' ? available : custom;
  const account = accounts.find((a) => a.id === accountId);

  const submit = () => {
    if (amountProblem) {
      setError(amountProblem);
      return;
    }
    if (accounts.length === 0) {
      setError('Add and verify a payout account on the web first.');
      return;
    }
    AppAlert.alert(
      `Request ${inr(payAmount)}?`,
      `${account ? `To ${account.ownerName}'s ${describeAccount(account)}. ` : ''}Unifesto sends it by bank transfer, usually within a few working days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: async () => {
            setSubmitting(true);
            setError('');
            const res = await requestPayout(eventId!, mode === 'custom' ? custom : undefined, accountId || undefined);
            setSubmitting(false);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            AppAlert.alert('Payout requested', "You'll see it in history as queued until the transfer is made.", [
              { text: 'Done', onPress: () => router.back() },
            ]);
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {title ? <Text style={[styles.event, { color: tokens.text }]} numberOfLines={2}>{title}</Text> : null}

        <SettingsGroup title="Balance" plain>
          <SettingsRow label="Event earnings" value={inr(summary.eventNet)} />
          <SettingsRow label="Paid out or queued" value={summary.committed > 0 ? `− ${inr(summary.committed)}` : inr(0)} />
          <SettingsRow label="Available" value={inr(available)} />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Earnings are after the {summary.defaultPlatformFeePercent}% platform fee and any refunds.
        </Text>

        {available <= 0 ? (
          <Text style={[styles.empty, { color: tokens.textMuted }]}>Nothing left to pay out for this event.</Text>
        ) : (
          <>
            <View style={{ marginTop: spacing[8] }}>
              <SegmentedTabs tabs={MODES} value={mode} onChange={(m) => { setMode(m); setError(''); }} />
            </View>
            {mode === 'custom' ? (
              <SettingsGroup plain>
                <FieldRow
                  label="Amount (₹)"
                  value={amount}
                  onChangeText={(v) => { setAmount(v); setError(''); }}
                  placeholder={`Up to ${inr(available)}`}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </SettingsGroup>
            ) : null}

            <SettingsGroup title="Pay to">
              {accounts.length === 0 ? (
                <SettingsRow label="No verified payout account" value="Add on web" />
              ) : (
                accounts.map((a) => {
                  const selected = a.id === accountId;
                  return (
                    <Pressable key={a.id} onPress={() => setAccountId(a.id)} accessibilityRole="radio" accessibilityState={{ selected }} style={styles.account}>
                      {selected ? (
                        <CheckCircle size={24} color={tokens.accent} weight="fill" />
                      ) : (
                        <CircleIcon size={24} color={tokens.textMuted} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.accountName, { color: tokens.text }]} numberOfLines={1}>
                          {describeAccount(a)}
                        </Text>
                        <Text style={[styles.accountSub, { color: tokens.textMuted }]} numberOfLines={1}>
                          {a.isOwn ? a.accountHolderName : `${a.ownerName} · ${a.accountHolderName}`}
                          {a.isPrimary ? '  ·  Primary' : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </SettingsGroup>

            {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

            <Button
              label={`Request ${mode === 'full' || !amountProblem ? inr(payAmount) : 'payout'}`}
              size="lg"
              fullWidth
              loading={submitting}
              onPress={submit}
              style={{ marginTop: spacing[6] }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, ...font() },
  event: { fontSize: typography.fontSize.xl, ...font('heading') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  empty: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 56 },
  accountName: { fontSize: typography.fontSize.base, ...font('medium') },
  accountSub: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  error: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
