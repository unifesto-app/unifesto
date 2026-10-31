import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { CardBackdrop } from '../ui/CardSurface';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

export interface QuickTile {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}

/** Row of equal borderless cards for the things I open most (saved, certificates, circles); bare glyphs. */
export default function QuickTiles({ tiles }: { tiles: QuickTile[] }) {
  const c = useCosmos();
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
          <Text style={[styles.label, { color: c.text }]} numberOfLines={1}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[3] },
  tile: {
    flex: 1,
    borderRadius: cosmosCardRadius,
    paddingVertical: spacing[4],
    alignItems: 'center',
    gap: spacing[2],
  },
  icon: { height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
