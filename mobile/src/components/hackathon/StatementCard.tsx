import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, CircleIcon as Circle } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../ui/CardSurface';
import ShadeCard from '../ui/ShadeCard';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

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
  /** The screen's hero (the team's locked statement): drawn on the hackathon's blue shade. Read-only. */
  hero?: boolean;
  /** Part of a list someone picks from: every card keeps its box, the full ones too. */
  choice?: boolean;
}

/**
 * One problem statement: code, title, theme and description. As a radio choice
 * for the team lead it is an option card (a control, so it keeps its box); read-only
 * (the list for members) it is a row on the page under a full hairline; the
 * team's locked statement is the blue hero.
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
  hero,
  choice,
}: StatementCardProps) {
  const c = useCosmos();
  const selectable = !!onPress;
  const boxed = selectable || !!choice;
  const Radio = selected ? CheckCircle : Circle;

  const body = (
    <>
      {hero || !boxed ? null : <CardBackdrop shape={styles.card} />}
      <View style={styles.top}>
        {code ? <Text style={[styles.code, { color: c.text }]}>{code}</Text> : null}
        {theme ? (
          <Text style={[styles.theme, { color: c.muted }]} numberOfLines={1}>
            {code ? '· ' : ''}
            {theme}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {note ? (
          <Text style={[styles.note, { color: note === 'Full' ? c.warn : c.muted }]}>{note}</Text>
        ) : null}
        {selectable ? (
          <Radio size={24} color={selected ? c.text : c.muted} weight={selected ? 'fill' : 'regular'} />
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

  if (hero) return <ShadeCard tone="blue" style={{ marginTop: spacing[3] }}>{body}</ShadeCard>;
  if (!selectable) return boxed ? <View style={styles.card}>{body}</View> : <View style={[styles.row, { borderTopColor: c.border }]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={[code, title, note].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.card,
        // Scale, not opacity: opacity breaks the Liquid Glass backdrop. The radio marks the pick; no outline.
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing[3],
    borderRadius: cosmosCardRadius,
    overflow: 'hidden',
    padding: spacing[5],
  },
  // Read-only: on the page, a full hairline above each statement.
  row: { paddingVertical: spacing[4], borderTopWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  code: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
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
