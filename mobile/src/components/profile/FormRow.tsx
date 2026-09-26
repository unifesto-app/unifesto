import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

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
  const tokens = useTokens();
  return (
    <View style={[styles.row, multiline && styles.rowMultiline]}>
      <View style={[styles.icon, multiline && { marginTop: 2 }]}>{icon}</View>
      {prefix ? <Text style={[styles.prefix, { color: tokens.textMuted }]}>{prefix}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={tokens.textMuted}
        selectionColor={tokens.accent}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline, { color: tokens.text }, style]}
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
  prefix: { fontSize: typography.fontSize.base, marginRight: -spacing[2], ...font('medium') },
  input: { flex: 1, fontSize: typography.fontSize.base, paddingVertical: spacing[3], ...font('medium') },
  inputMultiline: { minHeight: 88, paddingTop: 5, textAlignVertical: 'top' },
});
