import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { User } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { memberEmail, type MemberUser } from '../../lib/api/spaceMembers';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const AVATAR = 40;

export const SPACE_ROLE_LABEL: Record<string, string> = {
  SPACE_ADMIN: 'Space admin',
  MEMBER: 'Member',
};

interface Props {
  user: MemberUser;
  /** Right-hand text, e.g. the member's role. */
  trailing?: string;
  tags?: string[];
  busy?: boolean;
  onPress?: () => void;
}

/** Person row shared by the roster and the add-member search. */
export default function MemberRow({ user, trailing, tags = [], busy, onPress }: Props) {
  const tokens = useTokens();
  const name = user.fullName || user.username || 'Unnamed';
  const sub = memberEmail(user) || (user.username ? `@${user.username}` : null);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: tokens.elevated }]}>
          <User size={20} color={tokens.textMuted} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
            {name}
          </Text>
          {tags.map((t) => (
            <Text key={t} style={[styles.tag, { color: tokens.accent }]}>
              {t}
            </Text>
          ))}
        </View>
        {sub ? (
          <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={tokens.accent} />
      ) : trailing ? (
        <Text style={[styles.trailing, { color: tokens.textSecondary }]}>{trailing}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  name: { flexShrink: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  tag: { fontSize: typography.fontSize.xs, ...font('semibold') },
  sub: { fontSize: typography.fontSize.xs, ...font() },
  trailing: { fontSize: typography.fontSize.xs, ...font('semibold') },
});
