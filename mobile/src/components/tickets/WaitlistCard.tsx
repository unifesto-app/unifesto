import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Confetti, Hourglass } from '@unifesto/unicon/react-native';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import type { MyWaitlistEntry } from '../../lib/api/registrations';
import AuthButton from '../auth/AuthButton';
import PressableScale from '../ui/PressableScale';
import { isIosDigitalPurchaseBlocked } from '../../lib/iosPurchasePolicy';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { relativeWhen } from '../../utils/eventFormat';
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
  const c = useCosmos();
  const defaults = useDefaultImages();
  const offered = entry.waitlistStatus === 'OFFERED' && !!entry.offer;
  const offer = entry.offer;
  const iosBlocked = entry.event.type === 'ONLINE' && isIosDigitalPurchaseBlocked(offer?.amountDue);
  const place = entry.event.venueName || entry.event.city;

  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      {offered ? (
        <LinearGradient
          colors={[`rgba(${c.glow}, 0.14)`, `rgba(${c.glow}, 0)`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: c.card }]}>
          {coverOr(defaults, entry.event.id, entry.event.coverImageUrl) ? (
            <Image source={{ uri: coverOr(defaults, entry.event.id, entry.event.coverImageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={c.fallback} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{entry.event.title}</Text>
          <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>
            {relativeWhen(entry.event.startDateTime)}
          </Text>
          <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
            {[entry.ticketType?.name ?? 'Ticket', place].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[styles.stub, { borderLeftColor: c.border }]}>
          {offered ? (
            <>
              <Confetti size={22} color={c.text} weight="fill" />
              <Text style={[styles.stubLabel, { color: c.text }]}>You're in</Text>
            </>
          ) : (
            <>
              <Text style={[styles.stubNumber, { color: c.text }]}>#{entry.position ?? '–'}</Text>
              <Text style={[styles.stubLabel, { color: c.muted }]}>in line</Text>
            </>
          )}
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        {offered && offer ? (
          <>
            <Text style={[styles.body, { color: c.text }]}>
              {iosBlocked
                ? "A spot opened up. Paid tickets for online events aren't available in the iOS app."
                : offer.needsPayment
                ? `A spot opened up. Pay ₹${offer.amountDue} to confirm it. Your seat is held until you do.`
                : 'A spot opened up and your ticket is free, so it is already confirmed.'}
            </Text>
            {offer.needsPayment && offer.expiresAt ? (
              <View style={styles.deadline}>
                <Hourglass size={14} color={c.warn} weight="fill" />
                <Text style={[styles.deadlineText, { color: c.warn }]}>{timeLeft(offer.expiresAt)}</Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              {offer.needsPayment && !iosBlocked ? (
                <AuthButton label={`Pay ₹${offer.amountDue}`} onPress={onPay} loading={busy} style={{ flex: 1, height: 44 }} />
              ) : null}
              <PressableScale
                onPress={onLeave}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Turn down the spot for ${entry.event.title}`}
                style={[styles.secondary, { borderColor: c.border }]}
              >
                <Text style={[styles.secondaryText, { color: c.soft }]}>Turn down</Text>
              </PressableScale>
            </View>
          </>
        ) : (
          <View style={styles.waitingRow}>
            <Text style={[styles.body, { color: c.muted, flex: 1 }]}>
              Sold out. We'll tell you if a spot opens. Nothing is charged until then.
            </Text>
            <PressableScale
              feedback="inline"
              onPress={onLeave}
              accessibilityRole="button"
              accessibilityLabel={`Leave the waiting list for ${entry.event.title}`}
              style={styles.leaveHit}
            >
              <Text style={[styles.leave, { color: c.soft }]}>Leave</Text>
            </PressableScale>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingLeft: spacing[3] },
  // Event banners are 4:3.
  thumb: { width: 84, height: 63, borderRadius: borderRadius.md, overflow: 'hidden', marginVertical: spacing[3] },
  title: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  stub: {
    width: 72,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    gap: 2,
  },
  stubNumber: { fontSize: 24, lineHeight: 26, ...cosmosFont.figure },
  stubLabel: { fontSize: 12, ...cosmosFont.strong },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing[3], gap: spacing[2] },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deadlineText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  secondary: {
    minHeight: 44,
    paddingHorizontal: spacing[5],
    borderRadius: cosmosRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  leaveHit: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  leave: { fontSize: typography.fontSize.sm, textDecorationLine: 'underline', ...cosmosFont.strong },
});
