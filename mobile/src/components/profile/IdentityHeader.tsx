import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Skeleton from '../Skeleton';
import AuthButton from '../auth/AuthButton';
import PressableScale from '../ui/PressableScale';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

export interface IdentityStat {
  label: string;
  /** null while loading: the number skeletons, the label stays. */
  value: number | null;
  /** The figure's colour, by job (sky events, mint done). Defaults to text. */
  accent?: string;
  /** Omit for a read-only number. */
  onPress?: () => void;
}

interface IdentityHeaderProps {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  memberSince?: string | null;
  stats: IdentityStat[];
  /** Under the bio, e.g. the person's links on View profile. */
  links?: React.ReactNode;
  onEdit: () => void;
  /** Omit on the public view itself: Edit profile then stands alone. */
  onViewPublic?: () => void;
}

const AVATAR = 88;
/** Past this Dynamic Type scale the side-by-side buttons would truncate: stack them. */
const LARGE_TEXT = 1.3;

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

/**
 * The top of the Profile tab, straight on the page (no card): avatar, my name
 * (Hanken SemiBold; names are never display), handle and bio centred, two
 * outline buttons, then my numbers in a band between full hairlines.
 */
export default function IdentityHeader({ name, username, avatarUrl, bio, memberSince, stats, links, onEdit, onViewPublic }: IdentityHeaderProps) {
  const c = useCosmos();
  const large = useWindowDimensions().fontScale > LARGE_TEXT;
  const joined = memberSince
    ? `Since ${new Date(memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : null;

  return (
    <View>
      <View style={styles.who}>
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.avatar, { backgroundColor: c.raised }]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={[styles.initials, { color: c.text }]}>{initials(name) || '·'}</Text>
          )}
        </View>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={large ? undefined : 2}>{name}</Text>
        <Text style={[styles.sub, { color: c.muted }]} numberOfLines={large ? undefined : 1}>
          {[username ? `@${username}` : null, joined].filter(Boolean).join('  ·  ')}
        </Text>
        {bio ? <Text style={[styles.bio, { color: c.soft }]} numberOfLines={3}>{bio}</Text> : null}
        {links}
      </View>

      <View style={[styles.actions, large && styles.stackActions]}>
        <AuthButton label="Edit profile" variant="secondary" onPress={onEdit} style={[styles.action, large && styles.actionFull]} />
        {onViewPublic ? (
          <AuthButton label="View profile" variant="secondary" onPress={onViewPublic} style={[styles.action, large && styles.actionFull]} />
        ) : null}
      </View>

      <View style={[styles.stats, { borderColor: c.border }]}>
        {stats.map((s) => (
          <PressableScale
            key={s.label}
            feedback="inline"
            onPress={s.onPress}
            disabled={!s.onPress}
            hitSlop={8}
            accessibilityRole={s.onPress ? 'button' : 'text'}
            accessibilityLabel={s.value == null ? `${s.label}, loading` : `${s.label}, ${s.value}`}
            style={styles.stat}
          >
            {s.value == null ? (
              <Skeleton width={28} height={28} borderRadius={6} />
            ) : (
              <Text style={[styles.statValue, { color: s.accent ?? c.text }]}>{s.value}</Text>
            )}
            <Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={large ? 2 : 1}>{s.label}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

export function IdentityHeaderSkeleton() {
  const c = useCosmos();
  return (
    <View accessible accessibilityLabel="Loading profile">
      <View style={[styles.who, { gap: 10 }]}>
        <Skeleton width={AVATAR} height={AVATAR} borderRadius={AVATAR / 2} />
        <Skeleton width={160} height={20} borderRadius={6} style={{ marginTop: spacing[2] }} />
        <Skeleton width={120} height={14} borderRadius={6} />
      </View>
      <View style={[styles.stats, { borderColor: c.border }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.stat}>
            <Skeleton width={28} height={28} borderRadius={6} />
            <Skeleton width={56} height={12} borderRadius={6} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  who: { alignItems: 'center' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 28, ...cosmosFont.strong },
  name: { marginTop: spacing[4], fontSize: typography.fontSize.xl, lineHeight: 26, textAlign: 'center', ...cosmosFont.strong },
  sub: { marginTop: 4, fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  bio: {
    marginTop: spacing[3],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    ...cosmosFont.body,
  },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  // minHeight, not height: a fixed 46 clips the label at large Dynamic Type sizes.
  action: { flex: 1, height: undefined, minHeight: 46, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  stackActions: { flexDirection: 'column' },
  actionFull: { flex: 0, alignSelf: 'stretch' },
  // A band on the page: full hairlines above and below, like the row lists under it.
  stats: {
    flexDirection: 'row',
    marginTop: spacing[6],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  statValue: { fontSize: 24, lineHeight: 30, ...cosmosFont.figure },
  // sm, not xs: 11pt is the floor, not a size for labels people tap.
  statLabel: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
});
