import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { memberEmail, type MemberUser } from '../../lib/api/spaceMembers';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import { Monogram } from '../home/SpaceCards';

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

/** Person row shared by the roster and the add-member search (cosmos). */
export default function MemberRow({ user, trailing, tags = [], busy, onPress }: Props) {
  const c = useCosmos();
  const name = user.fullName || user.username || 'Unnamed';
  const sub = memberEmail(user) || (user.username ? `@${user.username}` : null);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[name, ...tags, trailing].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={[styles.avatar, { backgroundColor: c.card }]} />
      ) : (
        <Monogram name={name} size={AVATAR} radius={AVATAR / 2} />
      )}
      <View style={styles.body}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
            {name}
          </Text>
          {tags.map((t) => (
            <View key={t} style={[styles.tag, { backgroundColor: c.tint }]}>
              <Text style={[styles.tagText, { color: c.text }]}>{t}</Text>
            </View>
          ))}
        </View>
        {sub ? (
          <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={c.text} />
      ) : trailing ? (
        <Text style={[styles.trailing, { color: c.soft }]}>{trailing}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], minHeight: 64 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  body: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  name: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 11, ...cosmosFont.strong },
  sub: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  trailing: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
