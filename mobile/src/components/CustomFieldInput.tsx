import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { Check, CheckCircle } from 'phosphor-react-native';
import { CustomField } from '../lib/api/tickets';
import { useTokens } from '../context/ThemeContext';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

interface CustomFieldInputProps {
  field: CustomField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

const ID_PROOF_TYPES = [
  { label: 'Passport', value: 'passport' },
  { label: 'Driving licence', value: 'driver_license' },
  { label: 'National ID', value: 'national_id' },
  { label: 'Student ID', value: 'student_id' },
];

/**
 * One organiser-defined question. Borderless: inputs sit on a slightly lifted
 * fill, choices are rows that tint when picked.
 */
export default function CustomFieldInput({ field, value, onChange, error }: CustomFieldInputProps) {
  const tokens = useTokens();
  const fill = tokens.fill;
  const tint = 'rgba(52,145,255,0.14)';

  const textInput = (opts: { keyboardType?: KeyboardTypeOptions; multiline?: boolean; placeholder?: string; numeric?: boolean; noCaps?: boolean } = {}) => (
    <TextInput
      style={[
        styles.input,
        opts.multiline && styles.textarea,
        { backgroundColor: fill, color: tokens.text },
        error ? { backgroundColor: 'rgba(239,68,68,0.12)' } : null,
      ]}
      placeholder={opts.placeholder ?? field.placeholder ?? field.label}
      placeholderTextColor={tokens.textMuted}
      selectionColor={tokens.accent}
      value={opts.numeric ? value?.toString() || '' : value || ''}
      onChangeText={
        opts.numeric
          ? (t) => {
              const n = parseFloat(t);
              onChange(isNaN(n) ? '' : n);
            }
          : onChange
      }
      keyboardType={opts.keyboardType}
      autoCapitalize={opts.noCaps ? 'none' : 'sentences'}
      multiline={opts.multiline}
      numberOfLines={opts.multiline ? 4 : undefined}
      textAlignVertical={opts.multiline ? 'top' : undefined}
    />
  );

  const choice = (key: string, label: string, selected: boolean, onPress: () => void, multi = false) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.choice, { backgroundColor: selected ? tint : fill, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={[styles.choiceText, { color: selected ? tokens.accent : tokens.text }]}>{label}</Text>
      {selected ? <CheckCircle size={22} color={tokens.accent} weight="fill" /> : null}
    </Pressable>
  );

  const renderField = () => {
    switch (field.field_type) {
      case 'email':
        return textInput({ keyboardType: 'email-address', noCaps: true });
      case 'url':
        return textInput({ keyboardType: 'url', noCaps: true });
      case 'phone':
        return textInput({ keyboardType: 'phone-pad' });
      case 'textarea':
        return textInput({ multiline: true });
      case 'number':
        return textInput({ keyboardType: 'numeric', numeric: true });
      case 'date':
        return textInput({ placeholder: field.placeholder || 'YYYY-MM-DD' });
      case 'country':
        return textInput({ placeholder: field.placeholder || 'Country' });

      case 'checkbox':
        return (
          <Pressable onPress={() => onChange(!value)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: !!value }}>
            <View style={[styles.box, { backgroundColor: value ? tokens.accent : fill }]}>
              {value ? <Check size={14} color="#ffffff" weight="bold" /> : null}
            </View>
            <Text style={[styles.checkLabel, { color: tokens.text }]}>
              {field.label}
              {field.is_required ? <Text style={{ color: tokens.danger }}> *</Text> : null}
            </Text>
          </Pressable>
        );

      case 'radio':
      case 'dropdown':
        return (
          <View style={styles.choices}>
            {field.options_json?.map((o) => choice(o.value, o.label, value === o.value, () => onChange(o.value)))}
          </View>
        );

      case 'id_proof_type':
        return (
          <View style={styles.choices}>
            {ID_PROOF_TYPES.map((o) => choice(o.value, o.label, value === o.value, () => onChange(o.value)))}
          </View>
        );

      case 'multi_select': {
        const selected: any[] = Array.isArray(value) ? value : [];
        return (
          <View style={styles.choices}>
            {field.options_json?.map((o) => {
              const on = selected.includes(o.value);
              return choice(
                o.value,
                o.label,
                on,
                () => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value]),
                true,
              );
            })}
          </View>
        );
      }

      case 'file':
      case 'id_proof_upload':
        // The old "Choose file" button never opened a picker; say so plainly instead.
        return (
          <View style={[styles.input, styles.upload, { backgroundColor: fill }]}>
            <Text style={[styles.choiceText, { color: tokens.textMuted }]}>
              {value ? value.name || 'File selected' : "File uploads aren't available in the app yet"}
            </Text>
          </View>
        );

      default:
        return textInput();
    }
  };

  return (
    <View style={styles.container}>
      {field.field_type !== 'checkbox' ? (
        <Text style={[styles.label, { color: tokens.text }]}>
          {field.label}
          {field.is_required ? <Text style={{ color: tokens.danger }}> *</Text> : null}
        </Text>
      ) : null}
      {field.help_text ? <Text style={[styles.help, { color: tokens.textMuted }]}>{field.help_text}</Text> : null}
      {renderField()}
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing[5] },
  label: { fontSize: typography.fontSize.sm, marginBottom: spacing[2], ...font('semibold') },
  help: { fontSize: typography.fontSize.sm, marginTop: -4, marginBottom: spacing[2], ...font() },
  input: {
    minHeight: 50,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
    ...font(),
  },
  textarea: { minHeight: 110 },
  upload: { justifyContent: 'center' },
  choices: { gap: spacing[2] },
  choice: {
    minHeight: 50,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  choiceText: { flex: 1, fontSize: typography.fontSize.base, ...font('medium') },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  box: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontSize: typography.fontSize.base, ...font('medium') },
  error: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
});
