import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { cancelPayout, markPayoutPaid } from '../../lib/api/apex';
import { recallPayout, organiserName } from '../../lib/apexRequests';
import { longDate } from '../../components/apex/ApexRow';
import { payoutStatus } from '../../components/manage/FinanceRows';
import { FieldRow } from '../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { inr } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * One payout: what's owed, where to send it (copy-on-tap), then record it as
 * paid with the bank's UTR. Payouts are manual transfers — nothing here moves
 * money; it only records that you did.
 */
export default function AdminPayoutDetailScreen() {
  const { payoutId } = useLocalSearchParams<{ payoutId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const payout = payoutId ? recallPayout(payoutId) : undefined;
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState<'PAY' | 'CANCEL' | null>(null);

  useAnalyticsScreenTracking('ApexPayoutDetail');

  if (!payout) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>Open this payout from Requests or Settlements.</Text>
      </View>
    );
  }

  const status = payoutStatus(payout.status, tokens);
  const acct = payout.bankAccount;
  const open = payout.status === 'PENDING' || payout.status === 'PROCESSING';

  const copy = (label: string, value?: string | null) => async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    AppAlert.alert('Copied', `${label} copied.`);
  };

  const confirmPaid = () => {
    if (!utr.trim()) {
      AppAlert.alert('Add the UTR', 'Paste the bank reference so the organiser can match the transfer.');
      return;
    }
    AppAlert.alert(`Mark ${inr(payout.netAmount)} as paid?`, 'Only do this after the transfer has gone through. The organiser is told.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          setBusy('PAY');
          const res = await markPayoutPaid(payout.id, utr.trim());
          setBusy(null);
          if (!res.ok) AppAlert.alert("Couldn't update", res.message);
          else router.back();
        },
      },
    ]);
  };

  const confirmCancel = () =>
    AppAlert.alert('Cancel this payout?', 'The amount goes back to their available balance, and they can ask again.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel payout',
        style: 'destructive',
        onPress: async () => {
          setBusy('CANCEL');
          const res = await cancelPayout(payout.id);
          setBusy(null);
          if (!res.ok) AppAlert.alert("Couldn't cancel", res.message);
          else router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.amount, { color: tokens.text }]}>{inr(payout.netAmount)}</Text>
        <Text style={[styles.muted, { color: tokens.textMuted }]}>
          {[payout.event?.title, organiserName(payout)].filter(Boolean).join('  ·  ')}
        </Text>
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>

        <SettingsGroup title="Money" plain>
          <SettingsRow label="Ticket revenue" value={inr(payout.grossRevenue)} />
          <SettingsRow label={`Platform fee (${Number(payout.platformFeePercent)}%)`} value={`− ${inr(payout.platformFee)}`} />
          <SettingsRow label="To send" value={inr(payout.netAmount)} onPress={copy('Amount', String(Number(payout.netAmount)))} />
        </SettingsGroup>

        {acct ? (
          <SettingsGroup title={acct.methodType === 'UPI' ? 'Send by UPI (tap to copy)' : 'Send to (tap to copy)'} plain>
            {acct.accountHolderName ? <SettingsRow label="Name" value={acct.accountHolderName} onPress={copy('Name', acct.accountHolderName)} /> : null}
            {acct.upiId ? <SettingsRow label="UPI" value={acct.upiId} onPress={copy('UPI ID', acct.upiId)} /> : null}
            {acct.accountNumber ? <SettingsRow label="Account" value={acct.accountNumber} onPress={copy('Account number', acct.accountNumber)} /> : null}
            {acct.ifscCode ? <SettingsRow label="IFSC" value={acct.ifscCode} onPress={copy('IFSC', acct.ifscCode)} /> : null}
            {acct.bankName ? <SettingsRow label="Bank" value={acct.bankName} /> : null}
          </SettingsGroup>
        ) : (
          <Text style={[styles.note, { color: tokens.warning }]}>No payout account on this request.</Text>
        )}

        <SettingsGroup title="History" plain>
          <SettingsRow label="Asked on" value={longDate(payout.createdAt)} />
          {payout.completedAt ? <SettingsRow label="Paid on" value={longDate(payout.completedAt)} /> : null}
          {payout.utr ? <SettingsRow label="UTR" value={payout.utr} onPress={copy('UTR', payout.utr)} /> : null}
        </SettingsGroup>
        {payout.failureReason ? <Text style={[styles.note, { color: tokens.danger }]}>{payout.failureReason}</Text> : null}
        {payout.notes ? <Text style={[styles.note, { color: tokens.textSecondary }]}>{payout.notes}</Text> : null}

        {open ? (
          <>
            <SettingsGroup title="After you've sent it" plain>
              <FieldRow label="UTR / reference" value={utr} onChangeText={setUtr} placeholder="e.g. 402512345678" autoCapitalize="characters" autoCorrect={false} />
            </SettingsGroup>
            <Button label="Mark as paid" size="lg" fullWidth loading={busy === 'PAY'} onPress={confirmPaid} style={{ marginTop: spacing[6] }} />
            {payout.status === 'PENDING' ? (
              <Button label="Cancel payout" variant="danger" size="lg" fullWidth disabled={busy !== null} loading={busy === 'CANCEL'} onPress={confirmCancel} style={{ marginTop: spacing[3] }} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  amount: { fontSize: typography.fontSize['4xl'], ...font('heading') },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...font() },
  status: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
});
