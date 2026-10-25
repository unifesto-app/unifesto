import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, CircleIcon as Circle } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../ui/CardSurface';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

interface StatementCardProps {
  code: string | null;
  title: string;
  description: string;
  /** Theme line, e.g. "HealthTech". */
  theme?: string | null;
  /** Small note on the right of the code line, e.g. "2 places left" / "Full". */
  note?: string | null;
  /** Selectable cards show a radio; omit `onPress` for a read-only card. */
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Show the whole description instead of the first few lines. */
  expanded?: boolean;
}

/**
 * One problem statement: code, title, theme and description. Used read-only
 * (the team's locked statement, the list for members) and as a radio choice
 * for the team lead picking from the curator's list.
 */
export default function StatementCard({
  code,
  title,
  description,
  theme,
  note,
  selected,
  disabled,
  onPress,
  expanded,
}: StatementCardProps) {
  const c = useCosmos();
  const selectable = !!onPress;
  const Radio = selected ? CheckCircle : Circle;

  const body = (
    <>
      <CardBackdrop shape={styles.card} />
      <View style={styles.top}>
        {code ? <Text style={[styles.code, { color: c.primary }]}>{code}</Text> : null}
        {theme ? (
          <Text style={[styles.theme, { color: c.muted }]} numberOfLines={1}>
            {code ? '· ' : ''}
            {theme}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {note ? (
          <Text style={[styles.note, { color: note === 'Full' ? c.danger : c.muted }]}>{note}</Text>
        ) : null}
        {selectable ? (
          <Radio size={22} color={selected ? c.primary : c.muted} weight={selected ? 'fill' : 'regular'} />
        ) : null}
      </View>
      <Text style={[styles.title, { color: disabled ? c.muted : c.text }]}>{title}</Text>
      {description ? (
        <Text
          style={[styles.description, { color: c.soft }]}
          numberOfLines={expanded || selected ? undefined : 3}
        >
          {description}
        </Text>
      ) : null}
    </>
  );

  if (!selectable) return <View style={styles.card}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={[code, title, note].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.card,
        // Scale, not opacity: opacity breaks the Liquid Glass backdrop.
        { borderColor: selected ? c.primary : 'transparent', transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing[3],
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
    padding: spacing[4],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  code: { fontSize: typography.fontSize.sm, letterSpacing: 0.5, ...cosmosFont.strong },
  theme: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { fontSize: typography.fontSize.xs, marginRight: spacing[2], ...cosmosFont.strong },
  title: { marginTop: spacing[2], fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  description: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...cosmosFont.body,
  },
});
