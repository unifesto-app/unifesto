import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getRefund, reviewRefund, type RefundRequest } from '../lib/api/finance';
import { refundStatus } from '../components/manage/FinanceRows';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import ShadeCard from '../components/ui/ShadeCard';
import { GUTTER } from '../components/home/Section';
import { inr } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop } from '../components/ui/CardSurface';
import AdminRefundDecision from '../components/apex/AdminRefundDecision';
import usePlatformAdmin from '../hooks/usePlatformAdmin';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/** Approval claims stuck this long can be approved again (matches the backend). */
const STUCK_PROCESSING_MS = 10 * 60_000;

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
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.muted, { color: c.soft, textAlign: 'center' }]}>{error}</Text>
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
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
    <CosmosScreen keyboard keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
      <Text style={[styles.who, { color: c.text }]} accessibilityRole="header">{who}</Text>
      <Text style={[styles.muted, styles.meta, { color: c.muted }]} numberOfLines={2}>
        {[refund.event?.title, reg?.ticketType?.name].filter(Boolean).join('  ·  ')}
      </Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: status.color }]} />
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
      </View>

      {/* The money: the screen's hero, on the ivory shade. */}
      <ShadeCard tone="ivory" style={{ marginTop: spacing[6] }}>
        <Text style={[styles.heroLabel, { color: c.soft }]}>They asked for</Text>
        <Text style={[styles.heroValue, { color: c.ivory }]} numberOfLines={1} adjustsFontSizeToFit>
          {refund.requestedAmount ? inr(refund.requestedAmount) : 'Full refund'}
        </Text>
        <View style={{ marginTop: spacing[4] }}>
          <Line label="They paid" value={inr(paid)} />
          {fee > 0 ? <Line label="App fee (not refundable)" value={`− ${inr(fee)}`} /> : null}
          {already > 0 ? <Line label="Already refunded" value={`− ${inr(already)}`} /> : null}
          <Line label="Most they can get" value={inr(refundable)} />
          {refund.approvedAmount ? <Line label="Approved" value={inr(refund.approvedAmount)} /> : null}
          {Number(refund.cashRefunded) > 0 ? <Line label="Sent back" value={inr(refund.cashRefunded)} /> : null}
        </View>
      </ShadeCard>

      <View style={[styles.quote]}>
        <CardBackdrop shape={styles.quote} />
        <Text style={[styles.quoteText, { color: c.text }]}>“{refund.reason}”</Text>
        <Text style={[styles.quoteBy, { color: c.muted }]}>
          {refund.requesterRole === 'ATTENDEE' ? 'Asked by the attendee' : `Raised by ${refund.requestedBy?.fullName ?? 'an organiser'}`} · {when(refund.createdAt)}
        </Text>
      </View>

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
    </CosmosScreen>
  );
}

/** One line of the money breakdown on the shade card, under a hairline. */
function Line({ label, value }: { label: string; value: string }) {
  const c = useCosmos();
  return (
    <View style={[styles.line, { borderTopColor: c.border }]}>
      <Text style={[styles.lineLabel, { color: c.soft }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  muted: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  meta: { marginTop: spacing[1] },
  // A person's name: Hanken, never display.
  who: { fontSize: typography.fontSize['2xl'], lineHeight: 30, ...cosmosFont.strong },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  heroLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  heroValue: { marginTop: spacing[1], fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lineLabel: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  lineValue: { fontSize: typography.fontSize.base, ...cosmosFont.figure },
  quote: { marginTop: spacing[4], padding: spacing[5], borderRadius: cosmosCardRadius, gap: spacing[2] },
  quoteText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.strong },
  quoteBy: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
});
