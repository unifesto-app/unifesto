import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import type { CheckinPoint } from '../../lib/api/checkin';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface PointChipsProps {
  points: CheckinPoint[];
  value: string;
  onChange: (id: string) => void;
  /** Adds a leading "All points" chip whose id is ''. */
  allowAll?: boolean;
  /** Dark translucent chips for the camera overlay, in either theme. */
  onCamera?: boolean;
  /** Horizontal gutter so chips scroll edge-to-edge but start aligned. */
  inset?: number;
}

/** Horizontal chip row for picking a check-in point (Main entrance, Day 2…). */
export default function PointChips({ points, value, onChange, allowAll, onCamera, inset = 0 }: PointChipsProps) {
  const tokens = useTokens();
  const items = allowAll ? [{ id: '', name: 'All points' }, ...points] : points;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((p) => {
        const on = p.id === value;
        const bg = on
          ? onCamera
            ? '#ffffff'
            : tokens.text
          : LIQUID_GLASS
            ? undefined // GlassFill paints it
            : onCamera
              ? 'rgba(0, 0, 0, 0.5)'
              : tokens.fill;
        const fg = on ? (onCamera ? '#000000' : tokens.bg) : onCamera ? 'rgba(255, 255, 255, 0.9)' : tokens.textSecondary;
        return (
          <Pressable
            key={p.id || 'all'}
            onPress={() => onChange(p.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.chip, { backgroundColor: bg, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
          >
            {!on ? <GlassFill variant={onCamera ? 'clear' : 'regular'} interactive /> : null}
            <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
              {p.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing[2] },
  chip: { paddingHorizontal: spacing[4], height: 36, justifyContent: 'center', borderRadius: borderRadius.full },
  label: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
