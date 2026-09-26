import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getManagedEvent } from '../lib/api/eventAdmin';
import {
  createContentItem,
  deleteContentItem,
  SECTIONS,
  updateContentItem,
  type ContentField,
  type ContentItem,
  type ContentSection,
} from '../lib/api/eventContent';
import { FieldRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const KEYBOARD: Partial<Record<NonNullable<ContentField['kind']>, 'url' | 'email-address' | 'phone-pad'>> = {
  url: 'url',
  email: 'email-address',
  phone: 'phone-pad',
};

/** New agenda items default to the event's start, one hour long. */
function seed(section: ContentSection, item: ContentItem | undefined, eventStart?: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of SECTIONS[section].fields) values[f.key] = item?.[f.key] != null ? String(item[f.key]) : '';
  if (section === 'agenda' && !item) {
    const start = eventStart ? new Date(eventStart) : new Date();
    values.startTime = start.toISOString();
    values.endTime = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
  }
  return values;
}

/**
 * Add or edit one agenda item, speaker, prize, contact or FAQ. The fields come
 * from SECTIONS, so all five sections share this screen.
 */
export default function ContentItemEditorScreen() {
  const { eventId, section, itemId } = useLocalSearchParams<{ eventId: string; section: ContentSection; itemId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const def = SECTIONS[section] ?? SECTIONS.agenda;
  const isNew = itemId === 'new';

  const [values, setValues] = useState<Record<string, string> | null>(null);
  const initial = useRef('');
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('ContentItemEditor');

  useEffect(() => {
    if (!eventId) return;
    void getManagedEvent(eventId).then((res) => {
      if (!res.ok) {
        setError(res.message);
        setMissing(true);
        return;
      }
      const list = ((res.data as unknown as Record<string, ContentItem[] | undefined>)[section] ?? []) as ContentItem[];
      const item = isNew ? undefined : list.find((i) => i.id === itemId);
      if (!isNew && !item) {
        setMissing(true);
        return;
      }
      const v = seed(section, item, res.data.startDateTime);
      initial.current = JSON.stringify(v);
      setValues(v);
    });
  }, [eventId, section, itemId, isNew]);

  const set = (key: string, v: string) => {
    setError('');
    setValues((prev) => (prev ? { ...prev, [key]: v } : prev));
  };

  const dirty = isNew || (values !== null && JSON.stringify(values) !== initial.current);

  const validate = (): string => {
    if (!values) return '';
    for (const f of def.fields) if (f.required && !values[f.key]?.trim()) return `${f.label} is required.`;
    if (section === 'agenda' && new Date(values.endTime) <= new Date(values.startTime)) return 'The end must be after the start.';
    return '';
  };

  const save = async () => {
    if (!values || !eventId) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    const res = isNew
      ? await createContentItem(eventId, section, values)
      : await updateContentItem(eventId, section, itemId!, values);
    setSaving(false);
    if (!res.ok) {
      setError(res.denied ? "You can't edit this event." : res.message);
      return;
    }
    router.back();
  };

  const confirmDelete = () =>
    AppAlert.alert(`Delete this ${def.noun}?`, 'It comes off the public page straight away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteContentItem(eventId!, section, itemId!);
          setDeleting(false);
          if (!res.ok) {
            AppAlert.alert("Couldn't delete", res.message);
            return;
          }
          router.back();
        },
      },
    ]);

  const title = `${isNew ? 'New' : 'Edit'} ${def.noun}`;

  if (!values) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {missing ? (
          <Text style={[styles.muted, { color: tokens.textMuted }]}>{error || `This ${def.noun} no longer exists.`}</Text>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const textFields = def.fields.filter((f) => f.kind !== 'datetime');
  const dateFields = def.fields.filter((f) => f.kind === 'datetime');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup plain>
          {textFields.map((f) => (
            <FieldRow
              key={f.key}
              stacked
              multiline={f.kind === 'multiline'}
              label={f.required ? f.label : `${f.label} (optional)`}
              value={values[f.key]}
              onChangeText={(v) => set(f.key, v)}
              placeholder={f.placeholder}
              keyboardType={f.kind ? KEYBOARD[f.kind] : undefined}
              autoCapitalize={f.kind === 'url' || f.kind === 'email' ? 'none' : 'sentences'}
              autoCorrect={f.kind !== 'url' && f.kind !== 'email'}
            />
          ))}
        </SettingsGroup>

        {dateFields.length > 0 ? (
          <SettingsGroup title="When" plain>
            {dateFields.map((f) => (
              <DateTimeRow key={f.key} label={f.label} value={new Date(values[f.key])} onChange={(d) => set(f.key, d.toISOString())} />
            ))}
          </SettingsGroup>
        ) : null}

        {!isNew ? (
          <Button
            label={`Delete ${def.noun}`}
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={confirmDelete}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? `Add ${def.noun}` : 'Save changes'} onPress={save} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
});
