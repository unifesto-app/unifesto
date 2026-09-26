import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Trash } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useEventTicketTypes } from '../hooks/useEventTicketTypes';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createFormField,
  deleteFormField,
  updateFormField,
  FIELD_TYPES,
  OPTION_TYPES,
  type FormFieldType,
} from '../lib/api/ticketTypes';
import { FieldRow, SwitchRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

interface QuestionDraft {
  label: string;
  type: FormFieldType;
  /** One choice per line. */
  options: string;
  isRequired: boolean;
  perGroup: boolean;
}

const EMPTY: QuestionDraft = { label: '', type: 'TEXT', options: '', isRequired: false, perGroup: false };

/**
 * Add or edit one registration question on a ticket. `fieldId === 'new'`
 * creates it at the end of the ticket's form. `group === '1'` offers the
 * "ask once per group" choice, which only means something on group tickets.
 */
export default function TicketQuestionScreen() {
  const { eventId, ticketId, fieldId, group } = useLocalSearchParams<{
    eventId: string;
    ticketId: string;
    fieldId: string;
    group?: string;
  }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const types = useEventTicketTypes(eventId);
  const isNew = fieldId === 'new';
  const isGroup = group === '1';
  const siblings = useMemo(() => (ticketId ? types.fieldsFor(ticketId) : []), [types, ticketId]);
  const original = useMemo(() => (isNew ? undefined : siblings.find((f) => f.id === fieldId)), [isNew, siblings, fieldId]);

  const [draft, setDraft] = useState<QuestionDraft | null>(isNew ? EMPTY : null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('TicketQuestion');

  useEffect(() => {
    if (!isNew && original && !draft) {
      setDraft({
        label: original.label,
        type: original.type,
        options: (original.options ?? []).join('\n'),
        isRequired: original.isRequired,
        perGroup: original.perGroup,
      });
    }
  }, [isNew, original, draft]);

  const set = (patch: Partial<QuestionDraft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const needsOptions = draft ? OPTION_TYPES.includes(draft.type) : false;

  const save = async () => {
    if (!draft || !eventId || !ticketId) return;
    const options = draft.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean);
    if (!draft.label.trim()) return setError('Write the question.');
    if (needsOptions && options.length < 1) return setError('Add at least one choice, one per line.');
    const body = {
      label: draft.label.trim(),
      type: draft.type,
      options: needsOptions ? options : [],
      isRequired: draft.isRequired,
      perGroup: isGroup ? draft.perGroup : false,
    };
    setSaving(true);
    const res = isNew
      ? await createFormField(eventId, { ...body, ticketTypeId: ticketId, order: siblings.length })
      : await updateFormField(eventId, fieldId!, body);
    setSaving(false);
    if (!res.ok) {
      setError(res.denied ? "You can't edit this ticket's questions." : res.message);
      return;
    }
    router.back();
  };

  const confirmDelete = () =>
    AppAlert.alert('Delete this question?', 'Answers people already gave stay on their registrations.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteFormField(eventId!, fieldId!);
          setDeleting(false);
          if (!res.ok) {
            AppAlert.alert("Couldn't delete", res.message);
            return;
          }
          router.back();
        },
      },
    ]);

  const title = isNew ? 'New question' : 'Edit question';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {types.loading ? (
          <ActivityIndicator color={tokens.accent} />
        ) : (
          <Text style={[styles.muted, { color: tokens.textMuted }]}>This question no longer exists.</Text>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup title="Question" plain>
          <FieldRow
            stacked
            label="What to ask"
            value={draft.label}
            onChangeText={(v) => set({ label: v })}
            placeholder="e.g. T-shirt size"
            maxLength={255}
          />
        </SettingsGroup>

        <SettingsGroup title="Answer type" plain>
          {FIELD_TYPES.map((f) => (
            <SettingsRow
              key={f.key}
              label={f.label}
              trailing={draft.type === f.key ? <Check size={20} color={tokens.accent} weight="bold" /> : <View />}
              onPress={() => set({ type: f.key })}
            />
          ))}
        </SettingsGroup>

        {needsOptions ? (
          <>
            <SettingsGroup title="Choices" plain>
              <FieldRow
                stacked
                multiline
                label="One per line"
                value={draft.options}
                onChangeText={(v) => set({ options: v })}
                placeholder={'Small\nMedium\nLarge'}
              />
            </SettingsGroup>
          </>
        ) : null}

        <SettingsGroup plain>
          <SwitchRow label="Required" value={draft.isRequired} onValueChange={(v) => set({ isRequired: v })} />
          {isGroup ? (
            <SwitchRow
              label="Ask once per group"
              hint={draft.perGroup ? 'Only the person booking answers.' : 'Every member answers.'}
              value={draft.perGroup}
              onValueChange={(v) => set({ perGroup: v })}
            />
          ) : null}
        </SettingsGroup>

        {original ? (
          <Button
            label="Delete question"
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

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} locations={[0, 0.45]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
        <Button label={isNew ? 'Add question' : 'Save changes'} onPress={save} loading={saving} disabled={deleting} size="lg" fullWidth />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, ...font() },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  error: { marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
