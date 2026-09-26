import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { PencilSimple, UserFocus } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface ProfileHeroProps {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  memberSince?: string | null;
  onEdit: () => void;
  /** Omit to hide the "View profile" button (e.g. on the profile page itself). */
  onViewPublic?: () => void;
}

const AVATAR = 92;

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

/** Centered identity: ringed avatar, name, handle, bio, then two actions. */
export default function ProfileHero({ name, username, avatarUrl, bio, memberSince, onEdit, onViewPublic }: ProfileHeroProps) {
  const tokens = useTokens();
  const joined = memberSince
    ? `Member since ${new Date(memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : null;

  return (
    <View style={styles.wrap}>
      {/* Gradient ring: the one bit of brand colour on the page */}
      <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
        <View style={[styles.avatar, { backgroundColor: tokens.elevated, borderColor: tokens.bg }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={[styles.initials, { color: tokens.text }]}>{initials(name)}</Text>
          )}
        </View>
      </LinearGradient>

      <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>{name}</Text>
      <Text style={[styles.sub, { color: tokens.textSecondary }]} numberOfLines={1}>
        {[username ? `@${username}` : null, joined].filter(Boolean).join('  ·  ')}
      </Text>
      {bio ? (
        <Text style={[styles.bio, { color: tokens.textMuted }]} numberOfLines={3}>{bio}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            LIQUID_GLASS
              ? { transform: [{ scale: pressed ? 0.96 : 1 }] } // opacity would break the glass
              : { backgroundColor: tokens.text, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {/* Tinted with the text colour so it still reads as the primary action. */}
          <GlassFill interactive tint={tokens.text} />
          <PencilSimple size={15} color={tokens.bg} weight="bold" />
          <Text style={[styles.primaryText, { color: tokens.bg }]}>Edit profile</Text>
        </Pressable>
        {onViewPublic ? (
        <Pressable
          onPress={onViewPublic}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.secondary,
            LIQUID_GLASS
              ? { borderWidth: 0, transform: [{ scale: pressed ? 0.96 : 1 }] }
              : { backgroundColor: tokens.surface, borderColor: tokens.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <GlassFill interactive />
          <UserFocus size={15} color={tokens.text} weight="bold" />
          <Text style={[styles.secondaryText, { color: tokens.text }]}>View profile</Text>
        </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ProfileHeroSkeleton() {
  return (
    <View style={styles.wrap}>
      <Skeleton width={AVATAR + 8} height={AVATAR + 8} borderRadius={(AVATAR + 8) / 2} />
      <Skeleton width={180} height={22} borderRadius={8} style={{ marginTop: spacing[4] }} />
      <Skeleton width={140} height={14} borderRadius={7} style={{ marginTop: 10 }} />
      <Skeleton width={260} height={42} borderRadius={21} style={{ marginTop: spacing[5] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  ring: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: (AVATAR + 2) / 2,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 32, ...font('heading') },
  name: {
    marginTop: spacing[4],
    fontSize: typography.fontSize['2xl'],
    letterSpacing: -0.4,
    ...font('heading'),
  },
  sub: { marginTop: 4, fontSize: typography.fontSize.sm, ...font() },
  bio: {
    marginTop: spacing[3],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...font(),
  },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[5] },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.full,
  },
  primaryText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  secondaryText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
