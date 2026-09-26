import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import type { ManagedTicketType } from '../../lib/api/ticketTypes';
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

/** One ticket type: name, price, kind, and a fill bar when it has a capacity. */
export default function TicketTypeRow({ ticket, onPress }: { ticket: ManagedTicketType; onPress: () => void }) {
  const tokens = useTokens();
  const cap = ticket.totalQuantity;
  const fill = cap ? Math.min(1, ticket.soldCount / cap) : 0;
  const soldOut = cap != null && ticket.soldCount >= cap;
  const meta = [
    ticket.kind === 'GROUP' ? `Groups of ${ticket.minGroupSize ?? 1}–${ticket.maxGroupSize ?? 1}` : null,
    ticket.waitlistEnabled ? 'Waiting list on' : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <CardBackdrop shape={styles.card} />
      <View style={styles.top}>
        <Text style={[styles.name, { color: tokens.text }]} numberOfLines={2}>
          {ticket.name}
        </Text>
        <Text style={[styles.price, { color: tokens.text }]}>{formatPrice(ticket)}</Text>
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
  name: { flex: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  price: { fontSize: typography.fontSize.base, ...font('semibold') },
  meta: { fontSize: typography.fontSize.xs, ...font() },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[1] },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  count: { fontSize: typography.fontSize.xs, ...font('medium') },
});
