import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { User } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import type { AttendeeRow as Row } from '../../lib/api/manageEvent';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import type { Tokens } from '../../theme/tokens';

const AVATAR = 40;

/** One short status per attendee, most important first. */
export function attendeeBadge(r: Pick<Row, 'status' | 'paymentStatus' | 'isWaitlisted' | 'checkedInAt'>, tokens: Tokens) {
  if (r.status === 'CANCELLED') return { text: 'Cancelled', color: tokens.danger };
  if (r.isWaitlisted) return { text: 'Waitlisted', color: tokens.warning };
  if (r.paymentStatus === 'PENDING' || r.paymentStatus === 'FAILED') return { text: 'Unpaid', color: tokens.warning };
  if (r.paymentStatus === 'REFUNDED') return { text: 'Refunded', color: tokens.textMuted };
  if (r.checkedInAt || r.status === 'ATTENDED') return { text: 'Checked in', color: tokens.success };
  return { text: 'Registered', color: tokens.textMuted };
}

export default function AttendeeRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const tokens = useTokens();
  const badge = attendeeBadge(row, tokens);
  const name = row.user.fullName || row.user.username || 'Attendee';
  const sub = [row.ticketType?.name, row.groupSize && row.groupSize > 1 ? `Group of ${row.groupSize}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {row.user.avatarUrl ? (
        <Image source={{ uri: row.user.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: tokens.elevated }]}>
          <User size={20} color={tokens.textMuted} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.badge, { color: badge.color }]}>{badge.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  name: { fontSize: typography.fontSize.base, ...font('semibold') },
  sub: { fontSize: typography.fontSize.xs, ...font() },
  badge: { fontSize: typography.fontSize.xs, ...font('semibold') },
});
