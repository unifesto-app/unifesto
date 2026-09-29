import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Confetti, Hourglass } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import type { MyWaitlistEntry } from '../../lib/api/registrations';
import { Button } from '../ui';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { relativeWhen } from '../../utils/eventFormat';
import { CardBackdrop } from '../ui/CardSurface';
import { coverOr, useDefaultImages } from '../../lib/defaultImages';

/** "6 hours left", "40 minutes left", or a past-deadline note. */
function timeLeft(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Deadline passed';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minutes left`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hours left`;
  return `${Math.round(hours / 24)} days left`;
}

interface WaitlistCardProps {
  entry: MyWaitlistEntry;
  busy: boolean;
  onPay: () => void;
  onLeave: () => void;
}

/**
 * Same pass shape as a ticket, but the stub holds your place in the queue.
 * When the organiser offers a spot the card lights up and grows a Pay action.
 */
export default function WaitlistCard({ entry, busy, onPay, onLeave }: WaitlistCardProps) {
  const tokens = useTokens();
  const defaults = useDefaultImages();
  const offered = entry.waitlistStatus === 'OFFERED' && !!entry.offer;
  const offer = entry.offer;
  const place = entry.event.venueName || entry.event.city;

  return (
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      {offered ? (
        <LinearGradient
          colors={['rgba(52,145,255,0.28)', 'rgba(52,145,255,0.04)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: tokens.surface }]}>
          {coverOr(defaults, entry.event.id, entry.event.coverImageUrl) ? (
            <Image source={{ uri: coverOr(defaults, entry.event.id, entry.event.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={tokens.accentGradient} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{entry.event.title}</Text>
          <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
            {relativeWhen(entry.event.startDateTime)}
          </Text>
          <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>
            {[entry.ticketType?.name ?? 'Ticket', place].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[styles.stub, { borderLeftColor: tokens.border }]}>
          {offered ? (
            <>
              <Confetti size={22} color={tokens.accent} weight="fill" />
              <Text style={[styles.stubLabel, { color: tokens.accent }]}>You're in</Text>
            </>
          ) : (
            <>
              <Text style={[styles.stubNumber, { color: tokens.text }]}>#{entry.position ?? '–'}</Text>
              <Text style={[styles.stubLabel, { color: tokens.textMuted }]}>in line</Text>
            </>
          )}
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: tokens.border }]}>
        {offered && offer ? (
          <>
            <Text style={[styles.body, { color: tokens.text }]}>
              {offer.needsPayment
                ? `A spot opened up. Pay ₹${offer.amountDue} to confirm it. Your seat is held until you do.`
                : 'A spot opened up and your ticket is free, so it is already confirmed.'}
            </Text>
            {offer.needsPayment && offer.expiresAt ? (
              <View style={styles.deadline}>
                <Hourglass size={13} color={tokens.warning} weight="fill" />
                <Text style={[styles.deadlineText, { color: tokens.warning }]}>{timeLeft(offer.expiresAt)}</Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              {offer.needsPayment ? (
                <Button label={`Pay ₹${offer.amountDue}`} onPress={onPay} loading={busy} style={{ flex: 1 }} fullWidth />
              ) : null}
              <Pressable
                onPress={onLeave}
                disabled={busy}
                style={({ pressed }) => [styles.secondary, { borderColor: tokens.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.secondaryText, { color: tokens.textSecondary }]}>Turn down</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.waitingRow}>
            <Text style={[styles.body, { color: tokens.textMuted, flex: 1 }]}>
              Sold out. We'll tell you if a spot opens. Nothing is charged until then.
            </Text>
            <Pressable onPress={onLeave} hitSlop={8}>
              <Text style={[styles.leave, { color: tokens.textSecondary }]}>Leave</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingLeft: spacing[3] },
  // Event banners are 4:3.
  thumb: { width: 84, height: 63, borderRadius: borderRadius.md, overflow: 'hidden', marginVertical: spacing[3] },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...font('semibold') },
  meta: { fontSize: typography.fontSize.xs, ...font() },
  stub: {
    width: 72,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    gap: 2,
  },
  stubNumber: { fontSize: 24, lineHeight: 26, ...font('heading') },
  stubLabel: { fontSize: 11, ...font('semibold') },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing[3], gap: spacing[2] },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deadlineText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  secondary: {
    height: 44,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  leave: { fontSize: typography.fontSize.sm, textDecorationLine: 'underline', ...font('medium') },
});
