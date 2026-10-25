import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useTopSpacing from '../hooks/useTopSpacing';
import { getRefund, reviewRefund, type RefundRequest } from '../lib/api/finance';
import { refundStatus } from '../components/manage/FinanceRows';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { inr } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import AdminRefundDecision from '../components/apex/AdminRefundDecision';
import usePlatformAdmin from '../hooks/usePlatformAdmin';
import { cosmosFont, useCosmos } from '../theme/cosmos';

/** Approval claims stuck this long can be approved again (matches the backend). */
const STUCK_PROCESSING_MS = 10 * 60_000;

const GUTTER = spacing[6];

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : undefined;

/**
 * One refund request. While it's waiting on the organiser, the Space Admin
 * forwards it to Unifesto or rejects it with a reason the attendee will see.
 * Refunds cover the ticket price only; the app fee is never returned.
 */
export default function RefundDetailScreen() {
  const { refundId } = useLocalSearchParams<{ refundId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [refund, setRefund] = useState<RefundRequest | null>(null);
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'FORWARD' | 'REJECT' | null>(null);

  // Platform admins make the final call on refunds forwarded to Unifesto.
  const isPlatformAdmin = usePlatformAdmin();

  const load = useCallback(async () => {
    if (!refundId) return;
    const res = await getRefund(refundId);
    if (res.ok) setRefund(res.data);
    else setError(res.denied ? 'You can’t review refunds for this event.' : res.message);
  }, [refundId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: 'FORWARD' | 'REJECT') => {
    setBusy(action);
    const res = await reviewRefund(refundId!, action, action === 'REJECT' ? reason.trim() : undefined);
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't update", res.message);
      return;
    }
    router.back();
  };

  const confirmForward = () =>
    AppAlert.alert('Forward to Unifesto?', 'Unifesto approves the amount and sends the money back to the attendee.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forward', onPress: () => void act('FORWARD') },
    ]);

  const confirmReject = () => {
    if (!reason.trim()) {
      AppAlert.alert('Add a reason', 'The attendee sees why their refund was turned down.');
      return;
    }
    AppAlert.alert('Reject this refund?', 'The attendee is told, with your reason.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void act('REJECT') },
    ]);
  };

  if (!refund) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? <Text style={[styles.muted, { color: c.muted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const reg = refund.registration;
  const status = refundStatus(refund.status, c);
  const who = reg?.user?.fullName || reg?.user?.username || 'Attendee';
  const paid = Number(reg?.totalAmount ?? 0);
  const fee = Number(reg?.processingFee ?? 0);
  const already = Number(reg?.refundedAmount ?? 0);
  // The server's cap also counts a group's extra-seats payments.
  const refundable = refund.maxRefundable ?? Math.max(0, paid - fee - already);
  // Unifesto can send a forwarded refund, or send again one that failed or got stuck.
  const stuck =
    refund.status === 'PROCESSING' && !!refund.updatedAt && Date.now() - new Date(refund.updatedAt).getTime() > STUCK_PROCESSING_MS;
  const canSend = refund.status === 'PENDING_ADMIN' || refund.status === 'REFUND_FAILED' || stuck;
  const canReview = refund.status === 'PENDING_CURATOR';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.who, { color: c.text }]}>{who}</Text>
        <Text style={[styles.muted, { color: c.muted }]} numberOfLines={2}>
          {[refund.event?.title, reg?.ticketType?.name].filter(Boolean).join('  ·  ')}
        </Text>
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>

        <View style={[styles.quote]}>
          <CardBackdrop shape={styles.quote} />
          <Text style={[styles.quoteText, { color: c.text }]}>“{refund.reason}”</Text>
          <Text style={[styles.quoteBy, { color: c.muted }]}>
            {refund.requesterRole === 'ATTENDEE' ? 'Asked by the attendee' : `Raised by ${refund.requestedBy?.fullName ?? 'an organiser'}`} · {when(refund.createdAt)}
          </Text>
        </View>

        <SettingsGroup title="Money" plain>
          <SettingsRow label="They paid" value={inr(paid)} />
          {fee > 0 ? <SettingsRow label="App fee (not refundable)" value={`− ${inr(fee)}`} /> : null}
          {already > 0 ? <SettingsRow label="Already refunded" value={`− ${inr(already)}`} /> : null}
          <SettingsRow label="Most they can get" value={inr(refundable)} />
          <SettingsRow label="They asked for" value={refund.requestedAmount ? inr(refund.requestedAmount) : 'Full refund'} />
          {refund.approvedAmount ? <SettingsRow label="Approved" value={inr(refund.approvedAmount)} /> : null}
          {Number(refund.cashRefunded) > 0 ? <SettingsRow label="Sent back" value={inr(refund.cashRefunded)} /> : null}
        </SettingsGroup>

        {refund.curatorActionAt || refund.adminActionAt ? (
          <SettingsGroup title="What happened" plain>
            {refund.curatorActionAt ? (
              <SettingsRow label={refund.status === 'REJECTED' && !refund.adminActionAt ? 'Rejected by organiser' : 'Forwarded by organiser'} value={when(refund.curatorActionAt)} />
            ) : null}
            {refund.adminActionAt ? (
              <SettingsRow label={refund.status === 'APPROVED' ? 'Approved by Unifesto' : 'Decided by Unifesto'} value={when(refund.adminActionAt)} />
            ) : null}
          </SettingsGroup>
        ) : null}
        {refund.curatorNote ? <Text style={[styles.note, { color: c.soft }]}>Organiser note: {refund.curatorNote}</Text> : null}
        {refund.adminNote ? <Text style={[styles.note, { color: c.soft }]}>Unifesto note: {refund.adminNote}</Text> : null}

        {canReview ? (
          rejecting ? (
            <>
              <SettingsGroup title="Why are you rejecting it?" plain>
                <FieldRow
                  stacked
                  multiline
                  label="Reason (the attendee sees this)"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. Refunds closed 48 hours before the event."
                  autoFocus
                />
              </SettingsGroup>
              <Button label="Reject refund" variant="danger" size="lg" fullWidth loading={busy === 'REJECT'} onPress={confirmReject} style={{ marginTop: spacing[6] }} />
              <Button label="Back" variant="ghost" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(false)} style={{ marginTop: spacing[2] }} />
            </>
          ) : (
            <>
              <Button label="Forward to Unifesto" size="lg" fullWidth loading={busy === 'FORWARD'} onPress={confirmForward} style={{ marginTop: spacing[8] }} />
              <Button label="Reject" variant="danger" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(true)} style={{ marginTop: spacing[3] }} />
            </>
          )
        ) : null}
        {isPlatformAdmin && canSend ? (
          <AdminRefundDecision
            refundId={refund.id}
            refundable={refundable}
            owed={refund.status === 'PENDING_ADMIN' ? undefined : Number(refund.requestedAmount ?? refundable)}
            onDone={() => router.back()}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  who: { fontSize: typography.fontSize['2xl'], ...cosmosFont.display },
  status: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  quote: { marginTop: spacing[5], padding: spacing[4], borderRadius: 14, gap: spacing[2] },
  quoteText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.strong },
  quoteBy: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
});
