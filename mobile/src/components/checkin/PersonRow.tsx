import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check } from '@unifesto/unicon/react-native';
import { initials } from '../../utils/checkinFormat';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

const AVATAR = 40;

export function Avatar({ name, url, size = AVATAR }: { name: string; url?: string | null; size?: number }) {
  const c = useCosmos();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View
      style={[
        styles.avatarEmpty,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.input },
      ]}
    >
      <Text style={[styles.initials, { color: c.soft, fontSize: size * 0.36 }]}>{initials(name)}</Text>
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
  /** Small "Undo" link under the trailing text, for a mistaken check-in. */
  undo?: { busy: boolean; onPress: () => void };
}

/**
 * A person in a check-in list: avatar (or initials), name, one line of detail,
 * and either a timestamp or an inline "Check in" button that flips to a mint
 * "✓ Checked in" once done.
 */
export default function PersonRow({ name, avatarUrl, sub, aside, action, undo }: PersonRowProps) {
  const c = useCosmos();

  let trailing: React.ReactNode = null;
  if (action?.state === 'done') {
    trailing = (
      <View style={styles.done}>
        <Check size={15} color={c.success} weight="bold" />
        <Text style={[styles.doneText, { color: c.success }]}>Checked in</Text>
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
          { backgroundColor: c.primary, transform: [{ scale: pressed ? 0.95 : 1 }] },
        ]}
      >
        {action.state === 'busy' ? (
          <ActivityIndicator size="small" color={c.primaryFg} />
        ) : (
          <Text style={[styles.pillText, { color: c.primaryFg }]}>Check in</Text>
        )}
      </Pressable>
    );
  } else if (aside) {
    trailing = <Text style={[styles.aside, { color: c.muted }]}>{aside}</Text>;
  }
  if (undo) {
    trailing = (
      <View style={styles.trailing}>
        {trailing}
        {undo.busy ? (
          <ActivityIndicator size="small" color={c.muted} />
        ) : (
          <Pressable
            onPress={undo.onPress}
            accessibilityRole="button"
            accessibilityLabel={`Undo ${name}'s check-in`}
            hitSlop={8}
          >
            <Text style={[styles.undoText, { color: c.primary }]}>Undo</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Avatar name={name} url={avatarUrl} />
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
  initials: { ...cosmosFont.strong },
  body: { flex: 1, gap: 2 },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  sub: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  aside: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  pill: {
    minWidth: 88,
    height: 34,
    paddingHorizontal: spacing[4],
    borderRadius: cosmosRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  trailing: { alignItems: 'flex-end', gap: 4 },
  undoText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
