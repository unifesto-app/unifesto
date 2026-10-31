import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { GUTTER } from './Section';
import PressableScale from '../ui/PressableScale';

// Category banners are 4:3; kept small so the row stays one thumb-swipe tall.
const TILE_W = 136;
const TILE_H = (TILE_W * 3) / 4;

interface VibeRailProps {
  categories: { id: string; name: string; bannerUrl?: string | null }[];
  onPressCategory: (name: string) => void;
}

/** One-row strip of clean 4:3 category banners, each named underneath ("Find your vibe"). */
export default function VibeRail({ categories, onPressCategory }: VibeRailProps) {
  const c = useCosmos();
  // Large text: let names wrap rather than clip to a word.
  const lines = useWindowDimensions().fontScale > 1.3 ? 2 : 1;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {categories.map((cat) => (
        <PressableScale
          key={cat.id}
          onPress={() => onPressCategory(cat.name)}
          accessibilityRole="button"
          accessibilityLabel={cat.name}
          style={{ width: TILE_W }}
        >
          <View style={[styles.tile, { backgroundColor: c.card }]}>
            {cat.bannerUrl ? (
              <Image source={{ uri: cat.bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
          </View>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={lines}>{cat.name}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

/** Row of tile-sized placeholders; not scrollable since there's nothing to reach. */
export function VibeRailSkeleton() {
  return (
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: TILE_W }}>
          <Skeleton width={TILE_W} height={TILE_H} borderRadius={cosmosRadius} />
          <Skeleton width={TILE_W * 0.6} height={12} borderRadius={6} style={{ marginTop: spacing[2] }} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: GUTTER, gap: spacing[3] },
  tile: { width: TILE_W, height: TILE_H, borderRadius: cosmosRadius, overflow: 'hidden' },
  name: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
