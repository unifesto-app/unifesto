import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import Skeleton from '../Skeleton';
import { GUTTER } from './Section';

// Category banners are 4:3; kept small so the row stays one thumb-swipe tall.
const TILE_W = 136;
const TILE_H = (TILE_W * 3) / 4;

interface VibeRailProps {
  categories: { id: string; name: string; bannerUrl?: string | null }[];
  onPressCategory: (name: string) => void;
}

/** One-row strip of 4:3 category tiles ("Find your vibe"). */
export default function VibeRail({ categories, onPressCategory }: VibeRailProps) {
  const c = useCosmos();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {categories.map((cat) => (
        <Pressable
          key={cat.id}
          onPress={() => onPressCategory(cat.name)}
          accessibilityRole="button"
          accessibilityLabel={cat.name}
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: c.card, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
        >
          {cat.bannerUrl ? (
            <Image source={{ uri: cat.bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.name} numberOfLines={1}>{cat.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Row of tile-sized placeholders; not scrollable since there's nothing to reach. */
export function VibeRailSkeleton() {
  return (
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} width={TILE_W} height={TILE_H} borderRadius={borderRadius.lg} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: GUTTER, gap: spacing[2] },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: spacing[2] + 2,
  },
  name: { fontSize: typography.fontSize.sm, color: '#ffffff', ...cosmosFont.strong },
});
