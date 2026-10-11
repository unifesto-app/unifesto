import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import { PRESETS, type Preset } from '../../hooks/useEventsBrowse';
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

/** One-row strip of 4:3 category tiles ("Find your vibe"). */
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
          style={[
            styles.tile,
            { backgroundColor: c.card },
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
          <Text style={styles.name} numberOfLines={lines}>{cat.name}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

/** Quick filters that open Events pre-filtered. Solid fills: content layer, no glass. */
export function PresetChips({ onPress }: { onPress: (preset: Preset) => void }) {
  const c = useCosmos();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, styles.chips]}>
      {PRESETS.map((p) => (
        <PressableScale
          key={p.key}
          onPress={() => onPress(p.key)}
          accessibilityRole="button"
          accessibilityHint="Opens events with this filter"
          style={[styles.chip, { backgroundColor: c.raised }]}
        >
          <Text style={[styles.chipText, { color: c.text }]}>{p.label}</Text>
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
  chips: { paddingBottom: spacing[3] },
  chip: { minHeight: 44, paddingHorizontal: spacing[4], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
});
