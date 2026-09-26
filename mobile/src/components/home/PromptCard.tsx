import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { GUTTER } from './Section';
import { CardBackdrop } from '../ui/CardSurface';

interface PromptCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  onPress: () => void;
}

/** One-line nudge (sign in, set a username, finish profile). Never more than one at a time. */
export default function PromptCard({ icon, title, body, onPress }: PromptCardProps) {
  const tokens = useTokens();
  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.card,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
      >
        <CardBackdrop shape={styles.card} />
        <View style={styles.icon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.body, { color: tokens.textMuted }]}>{body}</Text>
        </View>
        <CaretRight size={16} color={tokens.textMuted} weight="bold" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  icon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.fontSize.base, ...font('semibold') },
  body: { fontSize: typography.fontSize.sm, marginTop: 2, ...font() },
});
