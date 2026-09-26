import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

export interface QuickTile {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}

/** Row of equal tiles for the things you open most (saved, certificates, circles). */
export default function QuickTiles({ tiles }: { tiles: QuickTile[] }) {
  const tokens = useTokens();
  return (
    <View style={styles.row}>
      {tiles.map((t) => (
        <Pressable
          key={t.key}
          onPress={t.onPress}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          style={({ pressed }) => [
            styles.tile,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
        >
          <CardBackdrop shape={styles.tile} />
          <View style={styles.icon}>{t.icon}</View>
          <Text style={[styles.label, { color: tokens.text }]} numberOfLines={1}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[3] },
  tile: {
    flex: 1,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing[4],
    alignItems: 'center',
    gap: spacing[2],
  },
  icon: { height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: typography.fontSize.sm, ...font('medium') },
});
