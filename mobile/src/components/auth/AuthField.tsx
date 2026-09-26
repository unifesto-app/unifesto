import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface AuthFieldProps extends TextInputProps {
  label: string;
  /** Fixed leading text inside the field, e.g. a country code. */
  prefix?: string;
  error?: boolean;
}

const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, prefix, error = false, onFocus, onBlur, style, ...rest },
  ref,
) {
  const tokens = useTokens();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? tokens.danger : focused ? tokens.accent : tokens.border;

  return (
    <View>
      <Text style={[styles.label, { color: tokens.textSecondary }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
            backgroundColor: focused ? tokens.elevated : tokens.surface,
          },
        ]}
      >
        {prefix ? (
          <View style={[styles.prefix, { borderRightColor: tokens.border }]}>
            <Text style={[styles.prefixText, { color: tokens.text }]}>{prefix}</Text>
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={tokens.textMuted}
          selectionColor={tokens.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: tokens.text }, style]}
          {...rest}
        />
      </View>
    </View>
  );
});

export default AuthField;

const styles = StyleSheet.create({
  label: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[2],
    ...font('medium'),
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
  },
  prefix: {
    paddingRight: spacing[3],
    marginRight: spacing[3],
    borderRightWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  prefixText: { fontSize: typography.fontSize.base, ...font('semibold') },
  input: {
    flex: 1,
    height: '100%',
    fontSize: typography.fontSize.base,
    ...font('medium'),
  },
});
