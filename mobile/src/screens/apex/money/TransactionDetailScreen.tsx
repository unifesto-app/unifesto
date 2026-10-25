import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../../../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import useTopSpacing from '../../../hooks/useTopSpacing';
import {
  adminRefund,
  getTransaction,
  reconcileTransaction,
  refundableBase,
  resolveTransaction,
  type TransactionDetail,
} from '../../../lib/api/apexMoney';
import { titleCase } from '../../../lib/apexQueues';
import { longDate } from '../../../components/apex/ApexRow';
import { FieldRow } from '../../../components/manage/FormFields';
import ChipPicker from '../../../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../../../components/profile/SettingsGroup';
import { Button } from '../../../components/ui';
import { AppAlert } from '../../../components/ui/AppAlert';
import { payerName, txnStatus } from './TransactionsScreen';
import { inr } from '../../../utils/money';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { cosmosFont, useCosmos } from '../../../theme/cosmos';

const GUTTER = spacing[6];

type Panel = 'refund' | 'resolve' | null;

const OUTCOMES: { value: 'CANCELLED' | 'FAILED'; label: string }[] = [
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FAILED', label: 'Failed' },
];

/**
 * One payment, end to end: money breakdown, who paid, which event and space,
 * tickets and refund history. Pending payments can be reconciled against
 * Razorpay (or closed by hand); paid ones can be refunded straight away.
 * `?pay=pay_…` arrives from Reconciliation to pre-fill the payment id.
 */
export default function TransactionDetailScreen() {
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [txn, setTxn] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomeMsg, setOutcomeMsg] = useState<{ text: string; danger?: boolean } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [payId, setPayId] = useState(pay ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [resolveAs, setResolveAs] = useState<'CANCELLED' | 'FAILED'>('CANCELLED');

  const load = useCallback(async () => {
    if (!id) return;
    const res = await getTransaction(id);
    if (res.ok) {
      setTxn(res.data.transaction);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, [id]);

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

  if (!txn) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? <Text style={[styles.muted, { color: c.muted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const status = txnStatus(txn.paymentStatus, c);
  const pending = txn.paymentStatus === 'PENDING';
  const canRefund = txn.paymentStatus === 'PAID' || txn.paymentStatus === 'PARTIALLY_REFUNDED';
  const maxBase = refundableBase(txn);

  const copy = (label: string, value?: string | null) => (value ? async () => {
    await Clipboard.setStringAsync(value);
    AppAlert.alert('Copied', `${label} copied.`);
  } : undefined);

  const openPanel = (p: Panel) => {
    setOutcomeMsg(null);
    if (p === 'refund') setAmount(maxBase > 0 ? String(maxBase) : '');
    setPanel((cur) => (cur === p ? null : p));
  };

  const runReconcile = async () => {
    setBusy(true);
    setOutcomeMsg(null);
    const res = await reconcileTransaction(txn.id, { paymentId: payId.trim() || undefined });
    setBusy(false);
    if (!res.ok) return setOutcomeMsg({ text: res.message, danger: true });
    setOutcomeMsg({ text: res.data.detail });
    if (res.data.changed) void load();
  };

  const runResolve = () =>
    AppAlert.alert(`Mark as ${resolveAs.toLowerCase()}?`, 'Only for a pending ticket with no payment behind it. No money moves.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Mark it',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const res = await resolveTransaction(txn.id, resolveAs, reason.trim());
          setBusy(false);
          if (!res.ok) return setOutcomeMsg({ text: res.message, danger: true });
          setPanel(null);
          setReason('');
          setOutcomeMsg({ text: res.data.detail });
          void load();
        },
      },
    ]);

  const runRefund = () => {
    const amt = Number(amount);
    if (!reason.trim()) return AppAlert.alert('Add a reason', 'Say why this is being refunded. It stays on the record.');
    if (!(amt > 0) || amt > maxBase) return AppAlert.alert('Check the amount', `Enter between ₹1 and ${inr(maxBase)}.`);
    AppAlert.alert(`Refund ${inr(amt)}?`, 'The money goes back through Razorpay right away. The processing fee is kept.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Refund',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const res = await adminRefund(txn.id, reason.trim(), amt);
          setBusy(false);
          if (!res.ok) return setOutcomeMsg({ text: res.message, danger: true });
          setPanel(null);
          setReason('');
          setOutcomeMsg({ text: 'Refund issued.' });
          void load();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} progressViewOffset={topSpacing} />}
      >
        <Text style={[styles.amount, { color: c.text }]}>{inr(txn.totalAmount)}</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          {[payerName(txn.user), txn.event.title, txn.ticketType?.name].filter(Boolean).join('  ·  ')}
        </Text>
        <Text style={[styles.status, { color: status.color }]}>
          {status.text}
          {Number(txn.refundedAmount) > 0 ? `  ·  ${inr(txn.refundedAmount)} refunded` : ''}
        </Text>

        {outcomeMsg ? <Text style={[styles.note, { color: outcomeMsg.danger ? c.danger : c.soft }]}>{outcomeMsg.text}</Text> : null}

        {pending ? (
          <>
            <SettingsGroup title="Stuck payment" plain>
              <FieldRow label="Payment id" value={payId} onChangeText={setPayId} placeholder="pay_… if the order was retried" autoCapitalize="none" autoCorrect={false} />
            </SettingsGroup>
            <Button label="Reconcile with Razorpay" size="lg" fullWidth loading={busy && panel === null} disabled={busy} onPress={runReconcile} style={{ marginTop: spacing[4] }} />
            <Button label="Mark manually" variant="secondary" size="lg" fullWidth disabled={busy} onPress={() => openPanel('resolve')} style={{ marginTop: spacing[3] }} />
          </>
        ) : null}
        {canRefund ? (
          <Button label="Issue refund" variant="secondary" size="lg" fullWidth disabled={busy} onPress={() => openPanel('refund')} style={{ marginTop: spacing[6] }} />
        ) : null}

        {panel === 'resolve' ? (
          <>
            <SettingsGroup title="Close it as" plain>
              <View style={styles.chips}>
                <ChipPicker options={OUTCOMES} value={resolveAs} onChange={(v) => v && setResolveAs(v)} />
              </View>
              <FieldRow stacked multiline label="Note (optional, kept in logs)" value={reason} onChangeText={setReason} placeholder="e.g. duplicate of an already-paid ticket" />
            </SettingsGroup>
            <Button label={`Mark as ${resolveAs.toLowerCase()}`} variant="danger" size="lg" fullWidth loading={busy} onPress={runResolve} style={{ marginTop: spacing[4] }} />
          </>
        ) : null}

        {panel === 'refund' ? (
          <>
            <SettingsGroup title="Refund (ticket price only)" plain>
              <FieldRow label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={String(maxBase)} />
              <FieldRow stacked multiline label="Reason" value={reason} onChangeText={setReason} placeholder="Why this is being refunded" />
            </SettingsGroup>
            <Text style={[styles.note, { color: c.muted }]}>{`Up to ${inr(maxBase)}. The processing fee is never refunded.`}</Text>
            <Button label="Refund now" variant="danger" size="lg" fullWidth loading={busy} onPress={runRefund} style={{ marginTop: spacing[4] }} />
          </>
        ) : null}

        <SettingsGroup title="Payment" plain>
          <SettingsRow label="Total" value={inr(txn.totalAmount)} />
          <SettingsRow label="Paid to gateway" value={inr(txn.razorpayAmount)} />
          <SettingsRow label="Processing fee" value={inr(txn.processingFee)} />
          <SettingsRow label="Refunded" value={inr(txn.refundedAmount)} />
          <SettingsRow label="Quantity" value={txn.groupSize ? `${txn.quantity} · group of ${txn.groupSize}` : String(txn.quantity)} />
          <SettingsRow label="Order id" value={txn.orderId ?? '—'} onPress={copy('Order id', txn.orderId)} />
          <SettingsRow label="Payment id" value={txn.paymentId ?? '—'} onPress={copy('Payment id', txn.paymentId)} />
          <SettingsRow label="Ticket status" value={titleCase(txn.status)} />
          <SettingsRow label="Paid" value={longDate(txn.paidAt) || '—'} />
          <SettingsRow label="Registered" value={longDate(txn.registeredAt)} />
          {txn.cancelledAt ? <SettingsRow label="Cancelled" value={longDate(txn.cancelledAt)} /> : null}
        </SettingsGroup>

        <SettingsGroup title="People" plain>
          <SettingsRow label="Attendee" value={payerName(txn.user)} onPress={() => router.push(`/apex/users/${txn.user.id}`)} />
          {txn.user.email ? <SettingsRow label="Email" value={txn.user.email} onPress={copy('Email', txn.user.email)} /> : null}
          {txn.user.mobileNumber ? <SettingsRow label="Phone" value={txn.user.mobileNumber} onPress={copy('Phone', txn.user.mobileNumber)} /> : null}
          <SettingsRow label="Curator" value={payerName(txn.organiser)} onPress={() => router.push(`/apex/users/${txn.organiser.id}`)} />
        </SettingsGroup>

        <SettingsGroup title="Event & space" plain>
          <SettingsRow label="Event" value={txn.event.title} onPress={() => router.push(`/apex/events/${txn.event.id}`)} />
          <SettingsRow label="Starts" value={longDate(txn.event.startDateTime)} />
          <SettingsRow label="Type" value={`${titleCase(txn.event.type)} · ${titleCase(txn.event.status)}`} />
          <SettingsRow label="Space" value={txn.space.name} onPress={() => router.push(`/apex/spaces/${txn.space.id}`)} />
          <SettingsRow label="Plan" value={`${titleCase(txn.space.plan)} · ${titleCase(txn.space.status)}`} />
        </SettingsGroup>

        {txn.tickets.length > 0 ? (
          <SettingsGroup title={`Tickets (${txn.tickets.length})`} plain>
            {txn.tickets.map((tk) => (
              <SettingsRow
                key={tk.id}
                label={tk.attendeeName || tk.attendeeEmail || tk.ticketCode}
                value={tk.checkedInAt ? `Checked in ${longDate(tk.checkedInAt)}` : titleCase(tk.status)}
                onPress={copy('Ticket code', tk.ticketCode)}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {txn.refundRequests.length > 0 ? (
          <SettingsGroup title={`Refund requests (${txn.refundRequests.length})`} plain>
            {txn.refundRequests.map((r) => (
              <SettingsRow
                key={r.id}
                label={`${titleCase(r.status)} · by ${r.requesterRole.toLowerCase()}`}
                value={Number(r.cashRefunded) > 0 ? inr(r.cashRefunded) : r.requestedAmount ? inr(r.requestedAmount) : 'Full'}
                onPress={() => router.push(`/manage/refund/${r.id}`)}
              />
            ))}
          </SettingsGroup>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  amount: { fontSize: typography.fontSize['4xl'], ...cosmosFont.display },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  status: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  chips: { padding: spacing[4] },
});
