import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

interface AuthFieldProps extends TextInputProps {
  label: string;
  /** Fixed leading text inside the field, e.g. a country code. */
  prefix?: string;
  error?: boolean;
  /** Right-side slot inside the field: spinner, status mark. */
  trailing?: React.ReactNode;
}

const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, prefix, error = false, trailing, multiline, onFocus, onBlur, style, ...rest },
  ref,
) {
  const c = useCosmos();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? c.danger : focused ? c.primary : c.input;

  return (
    <View>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <View style={[styles.field, multiline && styles.fieldMultiline, { borderColor, backgroundColor: c.card }]}>
        {prefix ? (
          <View style={[styles.prefix, { borderRightColor: c.border }]}>
            <Text style={[styles.prefixText, { color: c.text }]}>{prefix}</Text>
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={c.muted}
          selectionColor={c.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline, { color: c.text }, style]}
          {...rest}
        />
        {trailing}
      </View>
    </View>
  );
});

export default AuthField;

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 8, ...cosmosFont.strong },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderWidth: 1,
    borderRadius: cosmosRadius,
    paddingHorizontal: 16,
  },
  prefix: {
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  prefixText: { fontSize: 16, ...cosmosFont.strong },
  fieldMultiline: { height: undefined, minHeight: 110, alignItems: 'flex-start', paddingVertical: 14 },
  input: { flex: 1, height: '100%', fontSize: 16, ...cosmosFont.body },
  inputMultiline: { height: undefined, minHeight: 82, paddingTop: 0, textAlignVertical: 'top', lineHeight: 22 },
});
