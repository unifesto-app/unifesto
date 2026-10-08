import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Skeleton from '../Skeleton';
import AuthButton from '../auth/AuthButton';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';

export interface IdentityStat {
  label: string;
  /** null while loading: the number skeletons, the label stays. */
  value: number | null;
  onPress: () => void;
}

interface IdentityCardProps {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  memberSince?: string | null;
  stats: IdentityStat[];
  onEdit: () => void;
  onViewPublic: () => void;
}

const AVATAR = 72;

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

/**
 * The Profile tab's top card in the web's cosmos voice: silver-ringed avatar
 * beside a Michroma name, bio, two actions, then a hairline and my numbers.
 */
export default function IdentityCard({ name, username, avatarUrl, bio, memberSince, stats, onEdit, onViewPublic }: IdentityCardProps) {
  const c = useCosmos();
  const joined = memberSince
    ? `Since ${new Date(memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : null;

  return (
    <View style={[styles.card, { backgroundColor: LIQUID_GLASS ? undefined : c.raised }]}>
      <GlassFill radius={cosmosCardRadius} />
      <View style={styles.top}>
        <View style={[styles.ring, { borderColor: c.outline }]}>
          <View style={[styles.avatar, { backgroundColor: c.card }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={[styles.initials, { color: c.text }]}>{initials(name) || '·'}</Text>
            )}
          </View>
        </View>
        <View style={styles.who}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{name}</Text>
          <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>
            {[username ? `@${username}` : null, joined].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
      </View>

      {bio ? <Text style={[styles.bio, { color: c.soft }]} numberOfLines={3}>{bio}</Text> : null}

      <View style={styles.actions}>
        <AuthButton label="Edit profile" onPress={onEdit} style={styles.action} />
        <AuthButton label="View profile" variant="secondary" onPress={onViewPublic} style={styles.action} />
      </View>

      <View style={[styles.stats, { borderTopColor: c.border }]}>
        {stats.map((s) => (
          <Pressable
            key={s.label}
            onPress={s.onPress}
            accessibilityRole="button"
            accessibilityLabel={s.value == null ? s.label : `${s.value} ${s.label}`}
            style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.6 : 1 }]}
          >
            {s.value == null ? (
              <Skeleton width={28} height={22} borderRadius={6} />
            ) : (
              <Text style={[styles.statValue, { color: c.text }]}>{s.value}</Text>
            )}
            <Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={1}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function IdentityCardSkeleton() {
  const c = useCosmos();
  return (
    <View style={[styles.card, { backgroundColor: LIQUID_GLASS ? undefined : c.raised }]}>
      <GlassFill radius={cosmosCardRadius} />
      <View style={styles.top}>
        <Skeleton width={AVATAR + 8} height={AVATAR + 8} borderRadius={(AVATAR + 8) / 2} />
        <View style={[styles.who, { gap: 10 }]}>
          <Skeleton width={160} height={20} borderRadius={6} />
          <Skeleton width={120} height={14} borderRadius={6} />
        </View>
      </View>
      <Skeleton width="100%" height={52} borderRadius={14} style={{ marginTop: spacing[5] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  ring: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 22, ...cosmosFont.display },
  who: { flex: 1 },
  // Michroma runs wide: 18 reads like a 22 in Hanken.
  name: { fontSize: 18, lineHeight: 26, ...cosmosFont.display },
  sub: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  bio: {
    marginTop: spacing[4],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...cosmosFont.body,
  },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  action: { flex: 1, height: 46, paddingHorizontal: spacing[3] },
  stats: {
    flexDirection: 'row',
    marginTop: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.display },
  statLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
