import React from 'react';
import { StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface FieldRowProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Full-width input under a small caption (names, descriptions). */
  stacked?: boolean;
}

/**
 * One editable line inside a `SettingsGroup plain` card.
 *  inline:  "Capacity ............ 120"  (short numeric values, right-aligned)
 *  stacked: small caption over a full-width input (free text)
 */
export function FieldRow({ label, stacked, multiline, ...input }: FieldRowProps) {
  const tokens = useTokens();
  if (stacked) {
    return (
      <View style={styles.stacked}>
        <Text style={[styles.caption, { color: tokens.textMuted }]}>{label}</Text>
        <TextInput
          {...input}
          multiline={multiline}
          placeholderTextColor={tokens.textMuted}
          selectionColor={tokens.accent}
          style={[styles.stackedInput, multiline && styles.multiline, { color: tokens.text }]}
        />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        {...input}
        placeholderTextColor={tokens.textMuted}
        selectionColor={tokens.accent}
        style={[styles.inlineInput, { color: tokens.text }]}
      />
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, hint, value, onValueChange, disabled }: SwitchRowProps) {
  const tokens = useTokens();
  return (
    <View style={[styles.row, styles.switchRow]}>
      <View style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
        <Text style={[styles.label, { color: tokens.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: tokens.textMuted }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: tokens.accent, false: tokens.border }}
      />
    </View>
  );
}

/** Small heading over a control that isn't a card (segmented tabs, chips). */
export function BlockTitle({ children }: { children: string }) {
  const tokens = useTokens();
  return <Text style={[styles.blockTitle, { color: tokens.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  switchRow: { paddingVertical: spacing[3] },
  label: { flexShrink: 1, fontSize: typography.fontSize.base, ...font('medium') },
  // Takes the rest of the row so the tap target is wide and the value hugs the right edge.
  inlineInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: typography.fontSize.base,
    paddingVertical: spacing[3],
    ...font('medium'),
  },
  hint: { marginTop: 2, fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.4, ...font() },
  stacked: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1] },
  caption: { fontSize: typography.fontSize.xs, ...font('medium') },
  stackedInput: { fontSize: typography.fontSize.base, paddingTop: spacing[1], paddingBottom: spacing[3], ...font('medium') },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  blockTitle: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], marginLeft: spacing[1], ...font('semibold') },
});
