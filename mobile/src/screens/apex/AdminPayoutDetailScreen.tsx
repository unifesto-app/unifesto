import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { cancelPayout, markPayoutPaid } from '../../lib/api/apex';
import { recallPayout, organiserName } from '../../lib/apexRequests';
import { longDate } from '../../components/apex/ApexRow';
import { payoutStatus } from '../../components/manage/FinanceRows';
import { FieldRow } from '../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { GUTTER } from '../../components/home/Section';
import { inr } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

/**
 * One payout: what's owed, where to send it (copy-on-tap), then record it as
 * paid with the bank's UTR. Payouts are manual transfers — nothing here moves
 * money; it only records that you did.
 */
export default function AdminPayoutDetailScreen() {
  const { payoutId } = useLocalSearchParams<{ payoutId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const payout = payoutId ? recallPayout(payoutId) : undefined;
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState<'PAY' | 'CANCEL' | null>(null);

  if (!payout) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.muted, { color: c.soft, textAlign: 'center' }]}>Open this payout from Requests or Settlements.</Text>
        </View>
      </CosmosScreen>
    );
  }

  const status = payoutStatus(payout.status, c);
  const acct = payout.bankAccount;
  const open = payout.status === 'PENDING' || payout.status === 'PROCESSING';

  const copy = (label: string, value?: string | null) => async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    AppAlert.alert('Copied', `${label} copied.`);
  };

  // A32: the backend needs a 6 to 40 character UTR, unique per payout.
  const utrValid = utr.trim().length >= 6 && utr.trim().length <= 40;

  const confirmPaid = () => {
    if (!utrValid) {
      AppAlert.alert('Add the UTR', 'Paste the bank reference (6 to 40 characters) so the organiser can match the transfer.');
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
    <CosmosScreen keyboard contentContainerStyle={styles.content} keyboardDismissMode="interactive">
        <Text style={[styles.amount, { color: c.text }]}>{inr(payout.netAmount)}</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          {[payout.event?.title ?? payout.session?.title, organiserName(payout)].filter(Boolean).join('  ·  ')}
        </Text>
        <View style={[styles.chip, { backgroundColor: `${status.color}26` }]}>
          <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
        </View>

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
          <Text style={[styles.note, { color: c.warn }]}>No payout account on this request.</Text>
        )}

        <SettingsGroup title="History" plain>
          <SettingsRow label="Asked on" value={longDate(payout.createdAt)} />
          {payout.completedAt ? <SettingsRow label="Paid on" value={longDate(payout.completedAt)} /> : null}
          {payout.utr ? <SettingsRow label="UTR" value={payout.utr} onPress={copy('UTR', payout.utr)} /> : null}
        </SettingsGroup>
        {payout.failureReason ? <Text style={[styles.note, { color: c.danger }]}>{payout.failureReason}</Text> : null}
        {payout.notes ? <Text style={[styles.note, { color: c.soft }]}>{payout.notes}</Text> : null}

        {open ? (
          <>
            <SettingsGroup title="After you've sent it" plain>
              <FieldRow label="UTR / reference" value={utr} onChangeText={setUtr} placeholder="6 to 40 characters, e.g. 402512345678" autoCapitalize="characters" autoCorrect={false} maxLength={40} />
            </SettingsGroup>
            <Button label="Mark as paid" size="lg" fullWidth disabled={!utrValid || busy !== null} loading={busy === 'PAY'} onPress={confirmPaid} style={{ marginTop: spacing[6] }} />
            {payout.status === 'PENDING' ? (
              <Button label="Cancel payout" variant="danger" size="lg" fullWidth disabled={busy !== null} loading={busy === 'CANCEL'} onPress={confirmCancel} style={{ marginTop: spacing[3] }} />
            ) : null}
          </>
        ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  amount: { fontSize: typography.fontSize['4xl'], ...cosmosFont.figure },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  chip: { alignSelf: 'flex-start', marginTop: spacing[3], paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: 999 },
  status: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
});
