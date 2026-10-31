import React from 'react';
import { StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

interface FieldRowProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Full-width input under a small caption (names, descriptions). */
  stacked?: boolean;
  /** Shown under the input in the danger colour. */
  error?: string;
}

/**
 * One editable line inside a `SettingsGroup plain` card.
 *  inline:  "Capacity ............ 120"  (short numeric values, right-aligned)
 *  stacked: small caption over a full-width input (free text)
 */
export function FieldRow({ label, stacked, multiline, error, ...input }: FieldRowProps) {
  const c = useCosmos();
  const errorText = error ? (
    <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;
  if (stacked) {
    return (
      <View style={styles.stacked}>
        <Text style={[styles.caption, { color: error ? c.danger : c.muted }]}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          {...input}
          multiline={multiline}
          placeholderTextColor={c.muted}
          selectionColor={c.primary}
          style={[styles.stackedInput, multiline && styles.multiline, { color: c.text }]}
        />
        {errorText}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: error ? c.danger : c.text }]} numberOfLines={1}>
          {label}
        </Text>
        <TextInput
          accessibilityLabel={label}
          {...input}
          placeholderTextColor={c.muted}
          selectionColor={c.primary}
          style={[styles.inlineInput, { color: c.text }]}
        />
      </View>
      {errorText ? <View style={styles.inlineError}>{errorText}</View> : null}
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
  const c = useCosmos();
  return (
    <View style={[styles.row, styles.switchRow]}>
      <View style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
        <Text style={[styles.label, { color: c.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: c.input, true: c.primary }}
        thumbColor={value ? c.primaryFg : c.scheme === 'dark' ? c.text : c.card}
        ios_backgroundColor={c.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** Small heading over a control that isn't a card (segmented tabs, chips). */
export function BlockTitle({ children }: { children: string }) {
  const c = useCosmos();
  return <Text style={[styles.blockTitle, { color: c.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  switchRow: { paddingVertical: spacing[3] },
  label: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  // Takes the rest of the row so the tap target is wide and the value hugs the right edge.
  inlineInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: typography.fontSize.base,
    paddingVertical: spacing[3],
    ...cosmosFont.body,
  },
  hint: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
  stacked: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1] },
  caption: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  stackedInput: { fontSize: typography.fontSize.base, paddingTop: spacing[1], paddingBottom: spacing[3], ...cosmosFont.body },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  error: { paddingBottom: spacing[3], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.4, ...cosmosFont.body },
  inlineError: { paddingHorizontal: spacing[4], marginTop: -spacing[2] },
  blockTitle: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], marginLeft: spacing[1], ...cosmosFont.strong },
});
