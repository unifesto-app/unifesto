import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useTokens } from '../../context/ThemeContext';
import { GlassFill, LIQUID_GLASS } from './CardSurface';
import { borderRadius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const PAD = 4;

export interface SegmentedTabsProps<K extends string> {
  tabs: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /**
   * Optional fractional tab index (e.g. a pager's scrollX / pageWidth). When
   * given, the pill tracks it directly, so it follows the finger mid-swipe.
   */
  position?: SharedValue<number>;
  /** Liquid Glass track on iOS 26+ (default); the solid track elsewhere or when false. */
  glass?: boolean;
}

/** Segmented control with a pill that springs between tabs. */
export default function SegmentedTabs<K extends string>({ tabs, value, onChange, position, glass = true }: SegmentedTabsProps<K>) {
  const tokens = useTokens();
  const useGlass = glass && LIQUID_GLASS;
  const [width, setWidth] = useState(0);
  const segW = width > 0 ? (width - PAD * 2) / tabs.length : 0;
  const index = tabs.findIndex((t) => t.key === value);
  const x = useSharedValue(0);

  useEffect(() => {
    if (position) return;
    x.value = withSpring(index * segW, { damping: 20, stiffness: 220 });
  }, [index, segW, x, position]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: position ? position.value * segW : x.value }],
  }));

  return (
    <View
      style={[styles.track, useGlass ? { borderWidth: 0 } : { backgroundColor: tokens.surface, borderColor: tokens.border }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {useGlass ? <GlassFill interactive /> : null}
      {segW > 0 ? (
        <Animated.View style={[styles.pill, { width: segW, backgroundColor: tokens.text }, pill]} />
      ) : null}
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, { color: active ? tokens.bg : tokens.textSecondary }]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: PAD, borderRadius: borderRadius.full, borderWidth: 1 },
  pill: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: borderRadius.full },
  segment: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
