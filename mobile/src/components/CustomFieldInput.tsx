import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { CaretDown, Check, CheckCircle, MagnifyingGlass, Paperclip, X } from 'phosphor-react-native';
import { CustomField, uploadFormFieldFile } from '../lib/api/tickets';
import { useTokens } from '../context/ThemeContext';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import {
  FILE_DEFAULT_KINDS,
  FILE_DEFAULT_MAX_MB,
  FILE_KIND_MIMES,
  INDIAN_STATES_AND_UTS,
  isFileAnswer,
} from '../utils/formQuestions';

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

const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIsoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : undefined);

/**
 * One organiser-defined question. Borderless: inputs sit on a slightly lifted
 * fill, choices are rows that tint when picked. The backend re-checks every
 * answer, so this only needs to make the right answer easy to give.
 */
export default function CustomFieldInput({ field, value, onChange, error }: CustomFieldInputProps) {
  const tokens = useTokens();
  const fill = tokens.fill;
  const tint = 'rgba(52,145,255,0.14)';
  const c = field.config ?? {};

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
      maxLength={c.maxLength}
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

  // A single tick: legacy option-less checkbox, or a Yes / No question.
  const tick = () => (
    <Pressable onPress={() => onChange(!value)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: !!value }}>
      <View style={[styles.box, { backgroundColor: value ? tokens.accent : fill }]}>
        {value ? <Check size={14} color="#ffffff" weight="bold" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.checkLabel, { color: tokens.text }]}>
          {field.label}
          {field.is_required ? <Text style={{ color: tokens.danger }}> *</Text> : null}
        </Text>
        {field.help_text ? <Text style={[styles.help, { color: tokens.textMuted, marginTop: 2, marginBottom: 0 }]}>{field.help_text}</Text> : null}
      </View>
    </Pressable>
  );

  const renderField = () => {
    switch (field.field_type) {
      case 'email':
        return textInput({ keyboardType: 'email-address', noCaps: true });
      case 'url':
        return textInput({ keyboardType: 'url', noCaps: true, placeholder: field.placeholder || 'https://' });
      case 'phone':
        return textInput({ keyboardType: 'phone-pad' });
      case 'textarea':
        return textInput({ multiline: true });
      case 'number':
        return textInput({ keyboardType: 'numeric', numeric: true });
      case 'date':
        return <DateInput value={value} onChange={onChange} min={c.minDate} max={c.maxDate} hasError={!!error} />;
      case 'country':
        return textInput({ placeholder: field.placeholder || 'Country' });

      case 'checkbox':
      case 'yes_no':
        return tick();

      case 'radio':
        return (
          <View style={styles.choices}>
            {field.options_json?.map((o) => choice(o.value, o.label, value === o.value, () => onChange(o.value)))}
          </View>
        );

      // A real dropdown: a field that opens a sheet of the options. It used to
      // render as the same list of rows as Single choice.
      case 'dropdown':
        return (
          <OptionPicker
            options={field.options_json ?? []}
            title={field.label}
            placeholder={field.placeholder || 'Choose one'}
            value={value}
            onChange={onChange}
            hasError={!!error}
          />
        );

      case 'state':
        return (
          <OptionPicker
            options={STATE_OPTIONS}
            title="State or UT"
            placeholder="Choose state or UT"
            value={value}
            onChange={onChange}
            hasError={!!error}
          />
        );

      case 'rating': {
        const scale = c.scale === 10 ? 10 : 5;
        return (
          <View style={styles.ratingRow}>
            {Array.from({ length: scale }, (_, i) => i + 1).map((n) => {
              const on = value === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => onChange(on ? '' : n)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${n} of ${scale}`}
                  style={({ pressed }) => [styles.ratingCell, { backgroundColor: on ? tokens.accent : fill, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[styles.choiceText, { flex: 0, color: on ? '#ffffff' : tokens.text }]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      }

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
        return <FileInput field={field} value={value} onChange={onChange} hasError={!!error} />;

      case 'id_proof_upload':
        return (
          <View style={[styles.input, styles.upload, { backgroundColor: fill }]}>
            <Text style={[styles.choiceText, { color: tokens.textMuted }]}>File uploads aren't available for this question</Text>
          </View>
        );

      default:
        return textInput();
    }
  };

  if (field.field_type === 'section') {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{field.label}</Text>
        {field.help_text ? <Text style={[styles.help, { color: tokens.textMuted, marginTop: 2 }]}>{field.help_text}</Text> : null}
      </View>
    );
  }

  const ownLabel = field.field_type === 'checkbox' || field.field_type === 'yes_no';
  return (
    <View style={styles.container}>
      {!ownLabel ? (
        <Text style={[styles.label, { color: tokens.text }]}>
          {field.label}
          {field.is_required ? <Text style={{ color: tokens.danger }}> *</Text> : null}
        </Text>
      ) : null}
      {field.help_text && !ownLabel ? <Text style={[styles.help, { color: tokens.textMuted }]}>{field.help_text}</Text> : null}
      {renderField()}
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
    </View>
  );
}

/** Native date picker; the answer is stored as YYYY-MM-DD. */
function DateInput({ value, onChange, min, max, hasError }: { value: any; onChange: (v: string) => void; min?: string; max?: string; hasError: boolean }) {
  const tokens = useTokens();
  const current = fromIsoDate(value);
  const minimumDate = fromIsoDate(min);
  const maximumDate = fromIsoDate(max);

  if (Platform.OS === 'ios' && current) {
    return (
      <View style={[styles.input, styles.dateRow, { backgroundColor: tokens.fill }]}>
        <DateTimePicker
          value={current}
          mode="date"
          display="compact"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          accentColor={tokens.accent}
          onValueChange={(_, d) => onChange(toIsoDate(d))}
        />
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear date">
          <X size={18} color={tokens.textMuted} />
        </Pressable>
      </View>
    );
  }

  const open = () => {
    const start = current ?? minimumDate ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_, d) => onChange(toIsoDate(d)),
      });
    } else {
      // iOS: seed a value so the inline compact picker appears.
      onChange(toIsoDate(start));
    }
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.input,
        styles.dateRow,
        { backgroundColor: hasError ? 'rgba(239,68,68,0.12)' : tokens.fill, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.choiceText, { color: current ? tokens.text : tokens.textMuted }]}>
        {current ? current.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'}
      </Text>
      <CaretDown size={18} color={tokens.textMuted} />
    </Pressable>
  );
}

/** A searchable sheet of the 36 states and union territories. */
const STATE_OPTIONS = INDIAN_STATES_AND_UTS.map((s) => ({ label: s, value: s }));
/** Long lists get a search box; a handful of options don't need one. */
const SEARCH_FROM = 8;

type Option = { label: string; value: string };

function OptionPicker({
  options,
  title,
  placeholder,
  value,
  onChange,
  hasError,
}: {
  options: Option[];
  title: string;
  placeholder: string;
  value: any;
  onChange: (v: string) => void;
  hasError: boolean;
}) {
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchable = options.length >= SEARCH_FROM;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
  }, [q, options]);
  const selected = options.find((o) => o.value === value);
  const close = () => {
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? placeholder}`}
        style={({ pressed }) => [
          styles.input,
          styles.dateRow,
          { backgroundColor: hasError ? 'rgba(239,68,68,0.12)' : tokens.fill, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.choiceText, { color: selected ? tokens.text : tokens.textMuted }]} numberOfLines={1}>
          {selected?.label ?? (value ? String(value) : placeholder)}
        </Text>
        <CaretDown size={18} color={tokens.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={[styles.sheet, { backgroundColor: tokens.bg }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sectionTitle, { color: tokens.text, flex: 1 }]} numberOfLines={2}>
              {title}
            </Text>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
              <X size={24} color={tokens.text} />
            </Pressable>
          </View>
          {searchable ? (
            <View style={[styles.input, styles.dateRow, { backgroundColor: tokens.fill, marginBottom: spacing[3] }]}>
              <MagnifyingGlass size={18} color={tokens.textMuted} />
              <TextInput
                style={[styles.choiceText, { color: tokens.text, paddingVertical: 0 }]}
                value={q}
                onChangeText={setQ}
                placeholder="Search"
                placeholderTextColor={tokens.textMuted}
                autoFocus
              />
            </View>
          ) : null}
          <FlatList
            data={list}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: tokens.pressed }]}
                >
                  <Text style={[styles.choiceText, { color: on ? tokens.accent : tokens.text }]}>{item.label}</Text>
                  {on ? <CheckCircle size={22} color={tokens.accent} weight="fill" /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

/**
 * Pick a file, upload it privately, keep the returned answer. The backend
 * checks the file's real type and size again.
 */
function FileInput({ field, value, onChange, hasError }: { field: CustomField; value: any; onChange: (v: any) => void; hasError: boolean }) {
  const tokens = useTokens();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const kinds = field.config?.fileKinds?.length ? field.config.fileKinds : FILE_DEFAULT_KINDS;
  const maxMb = field.config?.maxSizeMb ?? FILE_DEFAULT_MAX_MB;
  const kindNames = kinds.map((k) => ({ pdf: 'PDF', image: 'image', doc: 'Word' })[k]).join(', ');

  const pick = async () => {
    setErr('');
    const res = await DocumentPicker.getDocumentAsync({
      type: kinds.flatMap((k) => FILE_KIND_MIMES[k]),
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > maxMb * 1024 * 1024) {
      setErr(`Files can be up to ${maxMb} MB.`);
      return;
    }
    setBusy(true);
    try {
      const file = { uri: a.uri, name: a.name, mimeType: a.mimeType };
      onChange(await (field.upload ? field.upload(file) : uploadFormFieldFile(field.event_id, field.id, file)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload the file.");
    } finally {
      setBusy(false);
    }
  };

  if (isFileAnswer(value)) {
    return (
      <View style={[styles.input, styles.dateRow, { backgroundColor: tokens.fill }]}>
        <Paperclip size={20} color={tokens.accent} />
        <Text style={[styles.choiceText, { color: tokens.text }]} numberOfLines={1}>
          {value.name}
        </Text>
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Remove file">
          <X size={18} color={tokens.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={pick}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.input,
          styles.dateRow,
          { backgroundColor: hasError || err ? 'rgba(239,68,68,0.12)' : tokens.fill, opacity: pressed || busy ? 0.8 : 1 },
        ]}
      >
        {busy ? <ActivityIndicator color={tokens.accent} /> : <Paperclip size={20} color={tokens.accent} />}
        <Text style={[styles.choiceText, { color: tokens.accent }]}>{busy ? 'Uploading…' : 'Choose file'}</Text>
        <Text style={[styles.help, { color: tokens.textMuted, marginTop: 0, marginBottom: 0 }]}>
          {kindNames} · {maxMb} MB
        </Text>
      </Pressable>
      {err ? <Text style={[styles.error, { color: tokens.danger }]}>{err}</Text> : null}
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
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
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
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  box: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkLabel: { fontSize: typography.fontSize.base, ...font('medium') },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  ratingCell: { width: 44, height: 44, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: spacing[2], marginBottom: spacing[4] },
  sectionTitle: { fontSize: typography.fontSize.lg, ...font('heading') },
  // Android shows the sheet full screen, so clear the status bar there.
  sheet: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing[4] : spacing[6],
    paddingBottom: spacing[8],
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], marginBottom: spacing[5] },
  sheetRow: {
    minHeight: 52,
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: borderRadius.lg,
  },
  error: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
});
