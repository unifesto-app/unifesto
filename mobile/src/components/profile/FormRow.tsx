import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

interface FormRowProps extends TextInputProps {
  icon: React.ReactNode;
  /** Fixed text before the input, e.g. "@" for a handle. */
  prefix?: string;
  /** Right-side slot: spinner, status icon… */
  trailing?: React.ReactNode;
}

/**
 * One editable line inside a SettingsGroup card. Same icon column and padding
 * as SettingsRow so the group's inset dividers line up.
 */
const FormRow = forwardRef<TextInput, FormRowProps>(function FormRow(
  { icon, prefix, trailing, multiline, style, ...rest },
  ref,
) {
  const c = useCosmos();
  return (
    <View style={[styles.row, multiline && styles.rowMultiline]}>
      <View style={[styles.icon, multiline && { marginTop: 2 }]}>{icon}</View>
      {prefix ? <Text style={[styles.prefix, { color: c.muted }]}>{prefix}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.muted}
        selectionColor={c.primary}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline, { color: c.text }, style]}
        {...rest}
      />
      {trailing}
    </View>
  );
});

export default FormRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 56,
  },
  rowMultiline: { alignItems: 'flex-start', paddingVertical: spacing[4] },
  icon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  prefix: { fontSize: typography.fontSize.base, marginRight: -spacing[2], ...cosmosFont.strong },
  input: { flex: 1, fontSize: typography.fontSize.base, paddingVertical: spacing[3], ...cosmosFont.strong },
  inputMultiline: { minHeight: 88, paddingTop: 5, textAlignVertical: 'top' },
});
