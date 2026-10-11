import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CalendarDots, Globe, Ticket } from '@unifesto/unicon/react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import { PRESETS, type Preset } from '../../hooks/useEventsBrowse';
import { weekendWindow } from '../../utils/eventFormat';
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

const PRESET_GLYPH: Record<Preset, typeof Globe> = { weekend: CalendarDots, free: Ticket, online: Globe };

/** "17–18 Oct", or "31 Oct – 1 Nov" when the weekend straddles a month. */
function weekendLabel() {
  const { start } = weekendWindow();
  const sun = new Date(start);
  sun.setDate(start.getDate() + 1);
  const mon = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short' });
  return mon(start) === mon(sun)
    ? `${start.getDate()}–${sun.getDate()} ${mon(sun)}`
    : `${start.getDate()} ${mon(start)} – ${sun.getDate()} ${mon(sun)}`;
}

const PRESET_HINT: Record<Preset, () => string> = {
  weekend: weekendLabel,
  free: () => 'No ticket cost',
  online: () => 'Join from anywhere',
};

/**
 * Quick filters that open Events pre-filtered: three equal tiles across the
 * full width (glyph, name, one line of context) instead of a scrolling pill
 * strip, so all three are visible and each is a real thumb target.
 */
export function PresetChips({ onPress }: { onPress: (preset: Preset) => void }) {
  const c = useCosmos();
  return (
    <View style={styles.presets}>
      {PRESETS.map((p) => {
        const Glyph = PRESET_GLYPH[p.key];
        const hint = PRESET_HINT[p.key]();
        return (
          <PressableScale
            key={p.key}
            onPress={() => onPress(p.key)}
            accessibilityRole="button"
            accessibilityLabel={`${p.label}, ${hint}`}
            accessibilityHint="Opens events with this filter"
            style={[styles.preset, { backgroundColor: c.raised }]}
          >
            <Glyph size={24} color={c.text} />
            <Text style={[styles.presetLabel, { color: c.text }]} numberOfLines={2}>{p.label}</Text>
            <Text style={[styles.presetHint, { color: c.muted }]} numberOfLines={2}>{hint}</Text>
          </PressableScale>
        );
      })}
    </View>
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
  presets: { flexDirection: 'row', gap: spacing[2], paddingHorizontal: GUTTER, paddingBottom: spacing[3] },
  preset: { flex: 1, minHeight: 96, padding: spacing[3], borderRadius: 14, gap: spacing[1] },
  presetLabel: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  presetHint: { fontSize: typography.fontSize.xs },
});
