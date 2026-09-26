import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { ArrowDown, ArrowUp } from 'phosphor-react-native';
import { isOffSale, saleStatus, SALE_STATUS_LABEL, type ManagedTicketType } from '../../lib/api/ticketTypes';
import { Badge } from '../ui/Badge';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

export function formatPrice(t: Pick<ManagedTicketType, 'price' | 'currency' | 'kind' | 'groupPricingMode'>) {
  const n = Number(t.price) || 0;
  if (t.kind === 'RSVP' || n === 0) return 'Free';
  const amount = `${t.currency === 'INR' ? '₹' : `${t.currency} `}${n.toLocaleString('en-IN')}`;
  if (t.kind === 'GROUP') return `${amount} ${t.groupPricingMode === 'PER_PERSON' ? 'per person' : 'per group'}`;
  return amount;
}

interface Props {
  ticket: ManagedTicketType;
  onPress: () => void;
  /** Reorder mode: arrows replace the tap-to-open. Omit a side at the ends. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reordering?: boolean;
}

/** One ticket type: name, price, status, stats, and a fill bar when it has a capacity. */
export default function TicketTypeRow({ ticket, onPress, onMoveUp, onMoveDown, reordering }: Props) {
  const tokens = useTokens();
  const cap = ticket.totalQuantity;
  const fill = cap ? Math.min(1, ticket.soldCount / cap) : 0;
  const soldOut = cap != null && ticket.soldCount >= cap;
  const status = SALE_STATUS_LABEL[saleStatus(ticket)];
  const stats = ticket.stats;
  const waiting = stats ? stats.waitlistWaiting + stats.waitlistOffered : 0;
  const meta = [
    ticket.kind === 'GROUP' ? `Groups of ${ticket.minGroupSize ?? 1}–${ticket.maxGroupSize ?? 1}` : null,
    stats ? `${stats.checkedIn.toLocaleString('en-IN')} checked in` : null,
    waiting > 0 ? `${waiting} waiting` : ticket.waitlistEnabled ? 'Waiting list on' : null,
    stats?.revenue ? `₹${stats.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} net` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={reordering ? undefined : onPress}
      disabled={reordering}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { opacity: isOffSale(ticket) ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <CardBackdrop shape={styles.card} />
      <View style={styles.top}>
        <View style={{ flex: 1, gap: spacing[2] }}>
          <Text style={[styles.name, { color: tokens.text }]} numberOfLines={2}>
            {ticket.name}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        {reordering ? (
          <View style={styles.arrows}>
            <Pressable onPress={onMoveUp} disabled={!onMoveUp} hitSlop={8} accessibilityLabel="Move up" style={{ opacity: onMoveUp ? 1 : 0.25 }}>
              <ArrowUp size={22} color={tokens.text} weight="bold" />
            </Pressable>
            <Pressable onPress={onMoveDown} disabled={!onMoveDown} hitSlop={8} accessibilityLabel="Move down" style={{ opacity: onMoveDown ? 1 : 0.25 }}>
              <ArrowDown size={22} color={tokens.text} weight="bold" />
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.price, { color: tokens.text }]}>{formatPrice(ticket)}</Text>
        )}
      </View>
      {meta.length ? <Text style={[styles.meta, { color: tokens.textMuted }]}>{meta.join('  ·  ')}</Text> : null}

      <View style={styles.bottom}>
        {cap ? (
          <View style={[styles.track, { backgroundColor: tokens.surface }]}>
            <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: soldOut ? tokens.warning : tokens.accent }]} />
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Text style={[styles.count, { color: soldOut ? tokens.warning : tokens.textSecondary }]}>
          {cap
            ? soldOut
              ? `Sold out · ${cap.toLocaleString('en-IN')}`
              : `${ticket.soldCount.toLocaleString('en-IN')} / ${cap.toLocaleString('en-IN')}`
            : `${ticket.soldCount.toLocaleString('en-IN')} booked · unlimited`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.xl, padding: spacing[4], gap: spacing[2] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  name: { fontSize: typography.fontSize.base, ...font('semibold') },
  arrows: { flexDirection: 'row', gap: spacing[4], paddingTop: 2 },
  price: { fontSize: typography.fontSize.base, ...font('semibold') },
  meta: { fontSize: typography.fontSize.xs, ...font() },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[1] },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  count: { fontSize: typography.fontSize.xs, ...font('medium') },
});
