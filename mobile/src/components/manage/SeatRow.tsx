import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretDown, CaretRight } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { displayFieldValue } from '../../hooks/useEventRegistration';
import { displayAnswer, isFileAnswer } from '../../utils/formQuestions';
import { openFormUpload } from '../../lib/api/tickets';
import type { GroupSeatRow } from '../../lib/api/manageEvent';
import type { CustomField } from '../../lib/api/tickets';
import type { Tokens } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const STATUS: Record<string, string> = { OPEN: 'Open', INVITED: 'Invited', CLAIMED: 'Filled', RELEASED: 'Released' };

const statusColor = (s: string, t: Tokens) => (s === 'CLAIMED' ? t.success : s === 'INVITED' ? t.warning : t.textMuted);

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

/** The seat's person, from the most reliable source: their account, what was filled in, then the invite. */
export function seatPerson(s: GroupSeatRow) {
  const d = s.memberDetails ?? {};
  return {
    name: s.claimedBy?.fullName || d.name || s.claimedBy?.username || undefined,
    email: s.claimedBy?.email || d.email || s.inviteEmail || undefined,
    mobile: d.mobile || undefined,
    gender: d.gender || undefined,
  };
}

interface SeatRowProps {
  seat: GroupSeatRow;
  /** Registration questions, for labelling this member's answers. */
  fields: CustomField[];
  /** Show a "Manage seat" link (the screen opens its menu of seat actions). */
  action?: 'manage';
  busy?: boolean;
  onAction?: () => void;
}

/**
 * One group seat: who holds it and its state; tap to see what they filled in
 * (contact details and their own answers). Seat 1 is the lead.
 */
export default function SeatRow({ seat, fields, action, busy, onAction }: SeatRowProps) {
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  const p = seatPerson(seat);
  const isLead = seat.seatIndex === 1;
  const answers = Object.entries(seat.memberDetails?.customFields ?? {})
    .map(([id, v]) => {
      const f = fields.find((x) => x.id === id);
      return {
        id,
        label: f?.label ?? 'Answer',
        value: f ? displayFieldValue(f, v) : displayAnswer(undefined, v),
        // A file answer opens through a short-lived link.
        open: f && isFileAnswer(v) ? () => void openFormUpload(f.event_id, v.key) : undefined,
      };
    })
    .filter((a) => a.value !== '');
  const hasDetail = !!(p.email || p.mobile || p.gender || answers.length || seat.claimedAt);
  const title = p.name || p.email || `Seat ${seat.seatIndex}`;

  const line = (label: string, value?: string, onPress?: () => void) =>
    value ? (
      <View style={styles.detail} key={label}>
        <Text style={[styles.detailLabel, { color: tokens.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: onPress ? tokens.accent : tokens.text }]} onPress={onPress} selectable>
          {value}
        </Text>
      </View>
    ) : null;

  return (
    <View>
      <Pressable
        onPress={hasDetail ? () => setOpen((o) => !o) : undefined}
        style={({ pressed }) => [styles.row, pressed && hasDetail && { backgroundColor: tokens.pressed }]}
        accessibilityRole={hasDetail ? 'button' : undefined}
        accessibilityState={hasDetail ? { expanded: open } : undefined}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
            {[`Seat ${seat.seatIndex}`, isLead ? 'Lead' : null, p.name && p.email ? p.email : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={[styles.status, { color: statusColor(seat.status, tokens) }]}>{STATUS[seat.status] ?? seat.status}</Text>
        {hasDetail ? (
          open ? <CaretDown size={14} color={tokens.textMuted} /> : <CaretRight size={14} color={tokens.textMuted} />
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {line('Email', p.email, p.email ? () => Linking.openURL(`mailto:${p.email}`) : undefined)}
          {line('Phone', p.mobile, p.mobile ? () => Linking.openURL(`tel:${p.mobile}`) : undefined)}
          {line('Gender', p.gender)}
          {line('Filled on', day(seat.claimedAt))}
          {answers.map((a) => line(a.label, a.value, a.open))}
        </View>
      ) : null}

      {action ? (
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator size="small" color={tokens.accent} />
          ) : (
            <Pressable onPress={onAction} hitSlop={8}>
              <Text style={[styles.link, { color: tokens.accent }]}>
                Manage seat
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 60 },
  name: { fontSize: typography.fontSize.base, ...font('medium') },
  sub: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  status: { fontSize: typography.fontSize.xs, ...font('semibold') },
  body: { paddingHorizontal: spacing[4], paddingBottom: spacing[3], gap: spacing[2] },
  detail: { gap: 2 },
  detailLabel: { fontSize: typography.fontSize.xs, ...font('medium') },
  detailValue: { fontSize: typography.fontSize.sm, ...font() },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing[4], paddingBottom: spacing[3] },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
