import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { decideRefund } from '../../lib/api/apex';
import { FieldRow } from '../manage/FormFields';
import { SettingsGroup } from '../profile/SettingsGroup';
import { Button } from '../ui';
import { AppAlert } from '../ui/AppAlert';
import { inr } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

interface Props {
  refundId: string;
  /** Upper bound shown to the admin; the server re-checks against the ticket base. */
  refundable: number;
  /** Set to send again a refund that failed or got stuck: no reject, this amount by default. */
  owed?: number;
  onDone: () => void;
}

/**
 * Unifesto's final say on a forwarded refund (platform admins only). Approving
 * sends the money back through Razorpay right away, so it's confirmed twice:
 * once by the amount field, once by the alert.
 */
export default function AdminRefundDecision({ refundId, refundable, owed, onDone }: Props) {
  const c = useCosmos();
  const retry = owed != null;
  const start = retry ? Math.min(owed, refundable) : refundable;
  const [amount, setAmount] = useState(start > 0 ? String(start) : '');
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);

  const run = async (action: 'APPROVE' | 'REJECT', approvedAmount?: number) => {
    setBusy(action);
    const res = await decideRefund(refundId, action, { approvedAmount, note: note.trim() });
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't update", res.message);
      return;
    }
    // Part of it couldn't go back (an extra-seats payment failed): say so.
    const sent = Number(res.data?.approvedAmount ?? 0);
    if (action === 'APPROVE' && approvedAmount != null && sent < approvedAmount) {
      AppAlert.alert(`Only ${inr(sent)} went back`, res.data?.adminNote ?? `${inr(approvedAmount - sent)} is still owed.`, [
        { text: 'OK', onPress: onDone },
      ]);
      return;
    }
    onDone();
  };

  const confirmApprove = () => {
    const value = Number(amount.replace(/[₹,\s]/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      AppAlert.alert('Check the amount', 'Enter how much to send back.');
      return;
    }
    if (refundable > 0 && value > refundable) {
      AppAlert.alert('Too much', `The most they can get is ${inr(refundable)}.`);
      return;
    }
    AppAlert.alert(`Refund ${inr(value)}?`, 'The money goes back to their original payment method now. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refund', onPress: () => void run('APPROVE', value) },
    ]);
  };

  const confirmReject = () =>
    AppAlert.alert('Reject this refund?', 'The attendee and organiser are told, with your note if you wrote one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void run('REJECT') },
    ]);

  if (rejecting) {
    return (
      <>
        <SettingsGroup title="Why are you rejecting it?" plain>
          <FieldRow stacked multiline label="Note (they see this)" value={note} onChangeText={setNote} placeholder="e.g. Outside the refund policy." autoFocus />
        </SettingsGroup>
        <Button label="Reject refund" variant="danger" size="lg" fullWidth loading={busy === 'REJECT'} onPress={confirmReject} style={{ marginTop: spacing[6] }} />
        <Button label="Back" variant="ghost" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(false)} style={{ marginTop: spacing[2] }} />
      </>
    );
  }

  return (
    <>
      <SettingsGroup title={retry ? 'Send the refund again' : 'Unifesto decision'} plain>
        <FieldRow label="Refund (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={String(refundable)} />
        <FieldRow stacked multiline label="Note (optional)" value={note} onChangeText={setNote} placeholder="Shown with the decision" />
      </SettingsGroup>
      <Text style={[styles.hint, { color: c.muted }]}>Ticket price only. The app fee is never refunded.</Text>
      <Button label={retry ? 'Send refund' : 'Approve and refund'} size="lg" fullWidth loading={busy === 'APPROVE'} onPress={confirmApprove} style={{ marginTop: spacing[6] }} />
      {retry ? null : (
        <Button label="Reject" variant="danger" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(true)} style={{ marginTop: spacing[3] }} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
