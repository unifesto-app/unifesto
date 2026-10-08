import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CheckCircle } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { initials } from '../../utils/checkinFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const AVATAR = 40;

export function Avatar({ name, url, size = AVATAR }: { name: string; url?: string | null; size?: number }) {
  const tokens = useTokens();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View
      style={[
        styles.avatarEmpty,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tokens.fillStrong },
      ]}
    >
      <Text style={[styles.initials, { color: tokens.textSecondary, fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

interface PersonRowProps {
  name: string;
  avatarUrl?: string | null;
  sub?: string;
  /** Right-aligned muted text, e.g. "4 min ago". Ignored when `action` is set. */
  aside?: string;
  /** Inline check-in control for search results. */
  action?: { state: 'idle' | 'busy' | 'done'; onPress: () => void };
}

/**
 * A person in a check-in list: avatar (or initials), name, one line of detail,
 * and either a timestamp or an inline "Check in" pill that flips to a green
 * "Checked in" once done.
 */
export default function PersonRow({ name, avatarUrl, sub, aside, action }: PersonRowProps) {
  const tokens = useTokens();

  let trailing: React.ReactNode = null;
  if (action?.state === 'done') {
    trailing = (
      <View style={styles.done}>
        <CheckCircle size={18} color={tokens.success} weight="fill" />
        <Text style={[styles.doneText, { color: tokens.success }]}>Checked in</Text>
      </View>
    );
  } else if (action) {
    trailing = (
      <Pressable
        onPress={action.onPress}
        disabled={action.state === 'busy'}
        accessibilityRole="button"
        accessibilityLabel={`Check in ${name}`}
        hitSlop={6}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: tokens.accent, transform: [{ scale: pressed ? 0.95 : 1 }] },
        ]}
      >
        {action.state === 'busy' ? (
          <ActivityIndicator size="small" color={tokens.accentFg} />
        ) : (
          <Text style={[styles.pillText, { color: tokens.accentFg }]}>Check in</Text>
        )}
      </Pressable>
    );
  } else if (aside) {
    trailing = <Text style={[styles.aside, { color: tokens.textMuted }]}>{aside}</Text>;
  }

  return (
    <View style={styles.row}>
      <Avatar name={name} url={avatarUrl} />
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
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 64,
  },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...font('semibold') },
  body: { flex: 1, gap: 2 },
  name: { fontSize: typography.fontSize.base, ...font('semibold') },
  sub: { fontSize: typography.fontSize.xs, ...font() },
  aside: { fontSize: typography.fontSize.xs, ...font('medium') },
  pill: {
    minWidth: 88,
    height: 34,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
