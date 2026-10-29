import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Skeleton from '../Skeleton';
import AuthButton from '../auth/AuthButton';
import PressableScale from '../ui/PressableScale';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

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
/** Past this Dynamic Type scale the side-by-side rows would truncate: stack them. */
const LARGE_TEXT = 1.3;

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
 * beside a DM Sans name, bio, two actions, then a hairline and my numbers.
 */
export default function IdentityCard({ name, username, avatarUrl, bio, memberSince, stats, onEdit, onViewPublic }: IdentityCardProps) {
  const c = useCosmos();
  const large = useWindowDimensions().fontScale > LARGE_TEXT;
  const joined = memberSince
    ? `Since ${new Date(memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : null;

  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <View style={[styles.top, large && styles.stack]}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.ring, { borderColor: c.outline }]}>
          <View style={[styles.avatar, { backgroundColor: c.card }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={[styles.initials, { color: c.text }]}>{initials(name) || '·'}</Text>
            )}
          </View>
        </View>
        <View style={large ? null : styles.who}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={large ? undefined : 2}>{name}</Text>
          <Text style={[styles.sub, { color: c.muted }]} numberOfLines={large ? undefined : 1}>
            {[username ? `@${username}` : null, joined].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
      </View>

      {bio ? <Text style={[styles.bio, { color: c.soft }]} numberOfLines={3}>{bio}</Text> : null}

      <View style={[styles.actions, large && styles.stackActions]}>
        <AuthButton label="Edit profile" onPress={onEdit} style={[styles.action, large && styles.actionFull]} />
        <AuthButton label="View profile" variant="secondary" onPress={onViewPublic} style={[styles.action, large && styles.actionFull]} />
      </View>

      <View style={[styles.stats, { borderTopColor: c.border }]}>
        {stats.map((s) => (
          <PressableScale
            key={s.label}
            feedback="inline"
            onPress={s.onPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={s.value == null ? `${s.label}, loading` : `${s.label}, ${s.value}`}
            style={styles.stat}
          >
            {s.value == null ? (
              <Skeleton width={28} height={22} borderRadius={6} />
            ) : (
              <Text style={[styles.statValue, { color: c.text }]}>{s.value}</Text>
            )}
            <Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={large ? 2 : 1}>{s.label}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

export function IdentityCardSkeleton() {
  const c = useCosmos();
  return (
    <View style={[styles.card, { backgroundColor: c.raised }]} accessible accessibilityLabel="Loading profile">
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
  stack: { flexDirection: 'column', alignItems: 'flex-start' },
  name: { fontSize: 22, lineHeight: 28, ...cosmosFont.display },
  sub: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  bio: {
    marginTop: spacing[4],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...cosmosFont.body,
  },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  // minHeight, not height: a fixed 46 clips the label at large Dynamic Type sizes.
  action: { flex: 1, height: undefined, minHeight: 46, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  stackActions: { flexDirection: 'column' },
  actionFull: { flex: 0, alignSelf: 'stretch' },
  stats: {
    flexDirection: 'row',
    marginTop: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.figure },
  // sm, not xs: 11pt is the floor, not a size for labels people tap.
  statLabel: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
});
