import React, { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowUpRight, CaretRight } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../ui/CardSurface';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

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
  /** An action row closing a list (Add, Manage): label in this card accent, no chevron. */
  accent?: string;
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
  /** No card: rows straight on the page with a full hairline between them, like Up next. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const FlatContext = createContext(false);

/** True inside a `flat` SettingsGroup: custom rows drop their side padding to line up with the gutter. */
export const useFlatRows = () => useContext(FlatContext);

/**
 * Inset-grouped list (Horizon): a muted Hanken SemiBold title in sentence case,
 * then rows on one borderless card divided by hairlines (or on the page, `flat`).
 * Monochrome: labels in text, values and chevrons muted, crimson only for
 * destructive rows.
 */
export function SettingsGroup({ title, action, plain, surface, flat, style, children }: SettingsGroupProps) {
  const c = useCosmos();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      <GroupTitle title={title} action={action} />
      <View style={flat ? null : [styles.card, surface ? { backgroundColor: surface } : null]}>
        {surface || flat ? null : <CardBackdrop shape={styles.card} />}
        <FlatContext.Provider value={!!flat}>
          {rows.map((row, i) => (
            <View key={i}>
              {row}
              {i < rows.length - 1 ? (
                <View style={[styles.divider, plain && styles.dividerPlain, flat && styles.dividerFlat, { backgroundColor: c.border }]} />
              ) : null}
            </View>
          ))}
        </FlatContext.Provider>
      </View>
    </View>
  );
}

function GroupTitle({ title, action }: Pick<SettingsGroupProps, 'title' | 'action'>) {
  const c = useCosmos();
  if (!title && !action) return null;
  return (
    <View style={styles.titleRow}>
      {title ? (
        <Text style={[styles.title, { color: c.muted }]} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View />
      )}
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.action, { color: c.text }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A SettingsGroup's top spacing and title, for a group whose rows are list items (see GroupCell). */
export function SettingsGroupHeader({ title, action, style }: Omit<SettingsGroupProps, 'children' | 'plain' | 'surface'>) {
  return (
    <View style={[styles.group, style]}>
      <GroupTitle title={title} action={action} />
    </View>
  );
}

/**
 * One row of a SettingsGroup-style card rendered as a FlatList item: the card
 * surface is drawn per row (rounded only at the ends) so long groups can
 * virtualise. Same look as SettingsGroup; `divider` overrides the hairline inset.
 */
export function GroupCell({ index, count, plain, divider, style, children }: {
  index: number;
  count: number;
  plain?: boolean;
  divider?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const c = useCosmos();
  const top = index === 0 ? cosmosCardRadius : 0;
  const bottom = index === count - 1 ? cosmosCardRadius : 0;
  const shape = { borderTopLeftRadius: top, borderTopRightRadius: top, borderBottomLeftRadius: bottom, borderBottomRightRadius: bottom };
  return (
    <View style={[shape, styles.cell, style]}>
      <CardBackdrop shape={shape} />
      {children}
      {index < count - 1 ? (
        <View style={[styles.divider, plain && styles.dividerPlain, { backgroundColor: c.border }, divider]} />
      ) : null}
    </View>
  );
}

export function SettingsRow({ icon, label, value, external, trailing, danger, accent, onPress }: SettingsRowProps) {
  const c = useCosmos();
  const flat = useContext(FlatContext);
  const content = (
    <>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, { color: danger ? c.danger : accent ?? c.text }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text style={[styles.value, { color: c.muted }]} numberOfLines={1}>{value}</Text> : null}
      {trailing ??
        (onPress && !accent ? (
          external ? (
            <ArrowUpRight size={15} color={c.muted} />
          ) : (
            <CaretRight size={15} color={danger ? c.danger : c.muted} />
          )
        ) : null)}
    </>
  );

  // On the page the row lines up with the gutter, and a press dims it rather than tinting a box.
  const row = [styles.row, flat && styles.rowFlat];
  if (!onPress) return <View style={row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      style={({ pressed }) => [row, pressed && (flat ? { opacity: 0.6 } : { backgroundColor: c.tint })]}
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
  title: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  action: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  cell: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 56,
    paddingVertical: spacing[2],
  },
  rowFlat: { paddingHorizontal: 0 },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  value: { fontSize: typography.fontSize.sm, maxWidth: '55%', ...cosmosFont.body },
  // Inset so the hairline starts under the label, not the icon.
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing[4] + ICON + spacing[3] },
  dividerPlain: { marginLeft: spacing[4] },
  dividerFlat: { marginLeft: 0 },
});
