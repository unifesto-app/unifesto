import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CaretRight } from '@unifesto/unicon/react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { CardBackdrop } from '../ui/CardSurface';
import PressableScale from '../ui/PressableScale';

interface PromptCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  onPress: () => void;
}

/** One-line nudge (sign in, set a username, finish profile). Never more than one at a time. */
export default function PromptCard({ icon, title, body, onPress }: PromptCardProps) {
  const c = useCosmos();
  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[
          styles.card,
        ]}
      >
        <CardBackdrop shape={styles.card} />
        <View style={styles.icon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.body, { color: c.muted }]}>{body}</Text>
        </View>
        <CaretRight size={16} color={c.muted} weight="bold" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: cosmosCardRadius,
  },
  icon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  body: { fontSize: typography.fontSize.sm, marginTop: 2, ...cosmosFont.body },
});
