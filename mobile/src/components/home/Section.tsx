import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/** Horizontal page gutter shared by every home section. */
export const GUTTER = spacing[6];
/** Gap between cards inside a rail. */
export const RAIL_GAP = spacing[3];

interface SectionProps {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Section({ title, subtitle, onSeeAll, children, style }: SectionProps) {
  const tokens = useTokens();
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: tokens.textMuted }]}>{subtitle}</Text> : null}
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            style={({ pressed }) => [styles.seeAll, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.seeAllText, { color: tokens.textSecondary }]}>See all</Text>
            <CaretRight size={12} color={tokens.textSecondary} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Edge-to-edge horizontal scroller whose first card lines up with the gutter. */
export function Rail({ children, snap }: { children: React.ReactNode; snap?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      decelerationRate={snap ? 'fast' : 'normal'}
      snapToInterval={snap}
      snapToAlignment="start"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing[10] },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: GUTTER,
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  title: { fontSize: typography.fontSize.xl, letterSpacing: -0.3, ...font('heading') },
  subtitle: { fontSize: typography.fontSize.sm, marginTop: 2, ...font() },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 2 },
  seeAllText: { fontSize: typography.fontSize.sm, ...font('medium') },
  rail: { paddingHorizontal: GUTTER, gap: RAIL_GAP },
});
