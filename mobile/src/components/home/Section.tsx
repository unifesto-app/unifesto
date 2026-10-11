import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowRight } from '@unifesto/unicon/react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

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

/**
 * Home section in the web's voice: a Michroma title (a VoiceOver heading, so
 * the rotor can jump between sections), a quiet subtitle and a "See all →" link.
 */
export function Section({ title, subtitle, onSeeAll, children, style }: SectionProps) {
  const c = useCosmos();
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: c.muted }]}>{subtitle}</Text> : null}
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            style={({ pressed }) => [styles.seeAll, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.seeAllText, { color: c.text }]}>See all</Text>
            <ArrowRight size={13} color={c.text} />
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
  section: { marginTop: spacing[12] },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: GUTTER,
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  // Michroma runs wide: a size below the old xl reads the same weight.
  title: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  subtitle: { fontSize: typography.fontSize.sm, marginTop: 4, ...cosmosFont.body },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 3 },
  seeAllText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  rail: { paddingHorizontal: GUTTER, gap: RAIL_GAP },
});
