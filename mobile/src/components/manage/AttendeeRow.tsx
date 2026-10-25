import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { User } from '@unifesto/unicon/react-native';
import type { AttendeeRow as Row } from '../../lib/api/manageEvent';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type Cosmos, cosmosFont, useCosmos } from '../../theme/cosmos';

const AVATAR = 40;

/** One short status per attendee, most important first. */
export function attendeeBadge(r: Pick<Row, 'status' | 'paymentStatus' | 'isWaitlisted' | 'checkedInAt'>, c: Cosmos) {
  if (r.status === 'CANCELLED') return { text: 'Cancelled', color: c.danger };
  if (r.isWaitlisted) return { text: 'Waitlisted', color: c.warn };
  if (r.paymentStatus === 'PENDING' || r.paymentStatus === 'FAILED') return { text: 'Unpaid', color: c.warn };
  if (r.paymentStatus === 'REFUNDED') return { text: 'Refunded', color: c.muted };
  if (r.checkedInAt || r.status === 'ATTENDED') return { text: 'Checked in', color: c.success };
  return { text: 'Registered', color: c.muted };
}

export default function AttendeeRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const c = useCosmos();
  const badge = attendeeBadge(row, c);
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
        <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: c.tint }]}>
          <User size={20} color={c.muted} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>
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
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sub: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  badge: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
});
