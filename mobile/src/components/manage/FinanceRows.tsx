import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import type { Tokens } from '../../theme/tokens';
import { describeAccount, type Payout, type PayoutStatus, type RefundRequest, type RefundStatus } from '../../lib/api/finance';
import { inr } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function payoutStatus(s: PayoutStatus, tokens: Tokens) {
  switch (s) {
    case 'COMPLETED':
      return { text: 'Paid', color: tokens.success };
    case 'PENDING':
      return { text: 'Queued', color: tokens.warning };
    case 'PROCESSING':
      return { text: 'Processing', color: tokens.warning };
    case 'FAILED':
      return { text: 'Failed', color: tokens.danger };
    default:
      return { text: 'Cancelled', color: tokens.textMuted };
  }
}

export function refundStatus(s: RefundStatus, tokens: Tokens) {
  switch (s) {
    case 'PENDING_CURATOR':
      return { text: 'Needs review', color: tokens.warning };
    case 'PENDING_ADMIN':
      return { text: 'With Unifesto', color: tokens.info ?? tokens.textSecondary };
    case 'APPROVED':
      return { text: 'Refunded', color: tokens.success };
    default:
      return { text: 'Rejected', color: tokens.danger };
  }
}

/**
 * One payout: event, destination, date, amount + status. `inCard` pads it for a
 * SettingsGroup card (same inset as SettingsRow); `detail` adds a third line,
 * e.g. the bank reference or why it failed.
 */
export function PayoutRow({
  payout,
  inCard,
  detail,
  onPress,
}: {
  payout: Payout;
  inCard?: boolean;
  detail?: { text: string; danger?: boolean } | null;
  onPress?: () => void;
}) {
  const tokens = useTokens();
  const status = payoutStatus(payout.status, tokens);
  const to = payout.bankAccount ? describeAccount(payout.bankAccount) : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, inCard && styles.inCard, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.body}>
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
          {payout.event?.title ?? 'Event'}
        </Text>
        <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
          {[shortDate(payout.completedAt ?? payout.createdAt), to].filter(Boolean).join('  ·  ')}
        </Text>
        {detail ? (
          <Text style={[styles.sub, { color: detail.danger ? tokens.danger : tokens.textMuted }]} numberOfLines={2}>
            {detail.text}
          </Text>
        ) : null}
      </View>
      <View style={styles.end}>
        <Text style={[styles.amount, { color: tokens.text }]}>{inr(payout.netAmount)}</Text>
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
      </View>
    </Pressable>
  );
}

/** One refund request: who, which event, why, how much. */
export function RefundRow({ refund, onPress }: { refund: RefundRequest; onPress: () => void }) {
  const tokens = useTokens();
  const status = refundStatus(refund.status, tokens);
  const who = refund.registration?.user?.fullName || refund.registration?.user?.username || 'Attendee';
  const amount = refund.approvedAmount ?? refund.requestedAmount;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
          {who}
        </Text>
        <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
          {[refund.event?.title, shortDate(refund.createdAt)].filter(Boolean).join('  ·  ')}
        </Text>
        <Text style={[styles.reason, { color: tokens.textSecondary }]} numberOfLines={1}>
          {refund.reason}
        </Text>
      </View>
      <View style={styles.end}>
        <Text style={[styles.amount, { color: tokens.text }]}>{amount ? inr(amount) : 'Full'}</Text>
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  // Matches SettingsRow's inset so payouts line up with other card rows.
  inCard: { paddingHorizontal: spacing[4], paddingVertical: spacing[4], minHeight: 64 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: typography.fontSize.base, ...font('semibold') },
  sub: { fontSize: typography.fontSize.xs, ...font() },
  reason: { fontSize: typography.fontSize.xs, ...font('medium') },
  end: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: typography.fontSize.base, ...font('semibold') },
  status: { fontSize: typography.fontSize.xs, ...font('semibold') },
});
