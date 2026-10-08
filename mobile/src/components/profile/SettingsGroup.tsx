import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowUpRight, CaretRight } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { CardBackdrop } from '../ui/CardSurface';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export interface SettingsRowProps {
  /** Omit for a plain label/value row (no leading glyph, no indent). */
  icon?: React.ReactNode;
  label: string;
  /** Right-aligned value, e.g. "v2.4.0" or "@handle". */
  value?: string;
  /** Opens outside the app (store, social) — shows ↗ instead of ›. */
  external?: boolean;
  /** Replaces the chevron, e.g. status marks or inline actions. */
  trailing?: React.ReactNode;
  /** Red label, for destructive rows. */
  danger?: boolean;
  /** Omit for a read-only row: no press state, no chevron. */
  onPress?: () => void;
}

interface SettingsGroupProps {
  title?: string;
  /** Small text action on the right of the title, e.g. Manage / Done. */
  action?: { label: string; onPress: () => void };
  /** Rows have no leading icon: dividers start at the card's inner edge. */
  plain?: boolean;
  /** A flat fill instead of the card backdrop, e.g. a cosmos card on a fusion page. */
  surface?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Inset-grouped list: title, rows on one rounded surface. */
export function SettingsGroup({ title, action, plain, surface, style, children }: SettingsGroupProps) {
  const tokens = useTokens();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {title || action ? (
        <View style={styles.titleRow}>
          {title ? <Text style={[styles.title, { color: tokens.textMuted }]}>{title}</Text> : <View />}
          {action ? (
            <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.action, { color: tokens.accent }]}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.card, surface ? { backgroundColor: surface } : null]}>
        {surface ? null : <CardBackdrop />}
        {rows.map((row, i) => (
          <View key={i}>
            {row}
            {i < rows.length - 1 ? (
              <View style={[styles.divider, plain && styles.dividerPlain, { backgroundColor: tokens.border }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function SettingsRow({ icon, label, value, external, trailing, danger, onPress }: SettingsRowProps) {
  const tokens = useTokens();
  const content = (
    <>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, { color: danger ? tokens.danger : tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text style={[styles.value, { color: tokens.textMuted }]} numberOfLines={1}>{value}</Text> : null}
      {trailing ??
        (onPress ? (
          external ? (
            <ArrowUpRight size={15} color={tokens.textMuted} />
          ) : (
            <CaretRight size={15} color={danger ? tokens.danger : tokens.textMuted} />
          )
        ) : null)}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]}
    >
      {content}
    </Pressable>
  );
}

const ICON = 30;

const styles = StyleSheet.create({
  group: { marginTop: spacing[8] },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
    marginHorizontal: spacing[1],
  },
  title: { fontSize: typography.fontSize.sm, ...font('semibold') },
  action: { fontSize: typography.fontSize.sm, ...font('semibold') },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 56,
    paddingVertical: spacing[2],
  },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: typography.fontSize.base, ...font('medium') },
  value: { fontSize: typography.fontSize.sm, maxWidth: '55%', ...font() },
  // Inset so the hairline starts under the label, not the icon.
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing[4] + ICON + spacing[3] },
  dividerPlain: { marginLeft: spacing[4] },
});
