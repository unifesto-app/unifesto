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
  CHOICE_TYPES,
  FIELD_TYPES,
  OPTION_TYPES,
  type FormFieldType,
  type TicketFormField,
} from '../lib/api/ticketTypes';
import {
  FILE_DEFAULT_KINDS,
  FILE_DEFAULT_MAX_MB,
  FILE_MAX_MB_CAP,
  INDIAN_STATES_AND_UTS,
  type FileKind,
  type FormFieldConfig,
} from '../utils/formQuestions';
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
  helpText: string;
  /** Min / max for the type's limit pair, as typed. */
  lo: string;
  hi: string;
  scale: 5 | 10;
  fileKinds: FileKind[];
  maxSizeMb: string;
  /** Show-if: the earlier question it depends on ('' = always shown). */
  showIfField: string;
  showIfAnyOf: string[];
}

const EMPTY: QuestionDraft = {
  label: '',
  type: 'TEXT',
  options: '',
  isRequired: false,
  perGroup: false,
  helpText: '',
  lo: '',
  hi: '',
  scale: 5,
  fileKinds: [...FILE_DEFAULT_KINDS],
  maxSizeMb: String(FILE_DEFAULT_MAX_MB),
  showIfField: '',
  showIfAnyOf: [],
};

/** Which limit pair each type uses, and how to caption it. */
const LIMITS: Partial<Record<FormFieldType, { lo: keyof FormFieldConfig; hi: keyof FormFieldConfig; label: string; date?: boolean }>> = {
  TEXT: { lo: 'minLength', hi: 'maxLength', label: 'Length in characters' },
  TEXTAREA: { lo: 'minLength', hi: 'maxLength', label: 'Length in characters' },
  NUMBER: { lo: 'min', hi: 'max', label: 'Allowed range' },
  DATE: { lo: 'minDate', hi: 'maxDate', label: 'Allowed dates (YYYY-MM-DD)', date: true },
  CHECKBOX: { lo: 'minPicks', hi: 'maxPicks', label: 'How many can be picked' },
};

const FILE_KIND_LABELS: { key: FileKind; label: string }[] = [
  { key: 'pdf', label: 'PDF' },
  { key: 'image', label: 'Images' },
  { key: 'doc', label: 'Word documents' },
];

/** The answers a choice question offers, for show-if. */
const choicesOf = (f: TicketFormField): string[] =>
  f.type === 'STATE' ? INDIAN_STATES_AND_UTS : f.type === 'YES_NO' ? ['Yes', 'No'] : f.options ?? [];

function draftFrom(f: TicketFormField): QuestionDraft {
  const c = f.config ?? {};
  const lim = LIMITS[f.type];
  return {
    ...EMPTY,
    label: f.label,
    type: f.type,
    options: (f.options ?? []).join('\n'),
    isRequired: f.isRequired,
    perGroup: f.perGroup,
    helpText: f.helpText ?? '',
    lo: lim && c[lim.lo] !== undefined ? String(c[lim.lo]) : '',
    hi: lim && c[lim.hi] !== undefined ? String(c[lim.hi]) : '',
    scale: c.scale === 10 ? 10 : 5,
    fileKinds: c.fileKinds?.length ? c.fileKinds : [...FILE_DEFAULT_KINDS],
    maxSizeMb: String(c.maxSizeMb ?? FILE_DEFAULT_MAX_MB),
    showIfField: f.showIf?.fieldId ?? '',
    showIfAnyOf: f.showIf?.anyOf ?? [],
  };
}

function configFrom(d: QuestionDraft): FormFieldConfig | null {
  const c: Record<string, unknown> = {};
  const lim = LIMITS[d.type];
  if (lim) {
    if (d.lo.trim()) c[lim.lo] = lim.date ? d.lo.trim() : Number(d.lo);
    if (d.hi.trim()) c[lim.hi] = lim.date ? d.hi.trim() : Number(d.hi);
  }
  if (d.type === 'RATING') c.scale = d.scale;
  if (d.type === 'FILE') {
    c.fileKinds = d.fileKinds;
    c.maxSizeMb = Number(d.maxSizeMb) || FILE_DEFAULT_MAX_MB;
  }
  return Object.keys(c).length ? (c as FormFieldConfig) : null;
}

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
    if (!isNew && original && !draft) setDraft(draftFrom(original));
  }, [isNew, original, draft]);

  const set = (patch: Partial<QuestionDraft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const needsOptions = draft ? OPTION_TYPES.includes(draft.type) : false;
  const isSection = draft?.type === 'SECTION';
  const lim = draft ? LIMITS[draft.type] : undefined;
  // Show-if may depend on an earlier choice question asked the same way.
  const myOrder = original?.order ?? siblings.length;
  const parents = draft
    ? siblings.filter(
        (f) =>
          f.id !== original?.id &&
          CHOICE_TYPES.includes(f.type) &&
          f.order < myOrder &&
          (!isGroup || f.perGroup === draft.perGroup),
      )
    : [];
  const parent = draft?.showIfField ? siblings.find((f) => f.id === draft.showIfField) : undefined;

  const save = async () => {
    if (!draft || !eventId || !ticketId) return;
    const options = draft.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean);
    if (!draft.label.trim()) return setError(isSection ? 'Write the heading.' : 'Write the question.');
    if (needsOptions && options.length < 1) return setError('Add at least one choice, one per line.');
    if (draft.type === 'FILE' && draft.fileKinds.length === 0) return setError('Allow at least one file type.');
    if (draft.showIfField && draft.showIfAnyOf.length === 0) return setError('Pick at least one answer that shows this question.');
    const body = {
      label: draft.label.trim(),
      type: draft.type,
      options: needsOptions ? options : [],
      isRequired: isSection ? false : draft.isRequired,
      perGroup: isGroup ? draft.perGroup : false,
      helpText: draft.helpText.trim() || null,
      config: configFrom(draft),
      showIf: draft.showIfField && !isSection ? { fieldId: draft.showIfField, anyOf: draft.showIfAnyOf } : null,
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
        <SettingsGroup title={isSection ? 'Heading' : 'Question'} plain>
          <FieldRow
            stacked
            label={isSection ? 'Heading text' : 'What to ask'}
            value={draft.label}
            onChangeText={(v) => set({ label: v })}
            placeholder={isSection ? 'e.g. Travel details' : 'e.g. T-shirt size'}
            maxLength={255}
          />
          <FieldRow
            stacked
            label={isSection ? 'Note under the heading (optional)' : 'Help text (optional)'}
            value={draft.helpText}
            onChangeText={(v) => set({ helpText: v })}
            placeholder={isSection ? 'e.g. Only if you travel from outside the city' : 'e.g. Link to your GitHub'}
            maxLength={500}
          />
        </SettingsGroup>

        <SettingsGroup title="Answer type" plain>
          {FIELD_TYPES.map((f) => (
            <SettingsRow
              key={f.key}
              label={f.label}
              trailing={draft.type === f.key ? <Check size={20} color={tokens.accent} weight="bold" /> : <View />}
              // Limits don't carry across types.
              onPress={() => set({ type: f.key, lo: '', hi: '' })}
            />
          ))}
        </SettingsGroup>
        {original ? (
          <Text style={[styles.muted, { color: tokens.textMuted, marginTop: -spacing[3], marginBottom: spacing[4] }]}>
            The type can't change once people have registered on this ticket.
          </Text>
        ) : null}

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

        {lim ? (
          <SettingsGroup title="Limits (optional)" plain>
            <FieldRow
              label={`Min · ${lim.label.toLowerCase()}`}
              value={draft.lo}
              onChangeText={(v) => set({ lo: v })}
              placeholder={lim.date ? 'YYYY-MM-DD' : 'None'}
              keyboardType={lim.date ? 'numbers-and-punctuation' : 'numeric'}
            />
            <FieldRow
              label={`Max · ${lim.label.toLowerCase()}`}
              value={draft.hi}
              onChangeText={(v) => set({ hi: v })}
              placeholder={lim.date ? 'YYYY-MM-DD' : 'None'}
              keyboardType={lim.date ? 'numbers-and-punctuation' : 'numeric'}
            />
          </SettingsGroup>
        ) : null}

        {draft.type === 'RATING' ? (
          <SettingsGroup title="Scale" plain>
            {([5, 10] as const).map((n) => (
              <SettingsRow
                key={n}
                label={`1 to ${n}`}
                trailing={draft.scale === n ? <Check size={20} color={tokens.accent} weight="bold" /> : <View />}
                onPress={() => set({ scale: n })}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {draft.type === 'FILE' ? (
          <>
            <SettingsGroup title="Allowed files" plain>
              {FILE_KIND_LABELS.map((k) => (
                <SwitchRow
                  key={k.key}
                  label={k.label}
                  value={draft.fileKinds.includes(k.key)}
                  onValueChange={(on) =>
                    set({ fileKinds: on ? [...draft.fileKinds, k.key] : draft.fileKinds.filter((x) => x !== k.key) })
                  }
                />
              ))}
              <FieldRow
                label={`Max size in MB (up to ${FILE_MAX_MB_CAP})`}
                value={draft.maxSizeMb}
                onChangeText={(v) => set({ maxSizeMb: v })}
                keyboardType="numeric"
              />
            </SettingsGroup>
            <Text style={[styles.muted, { color: tokens.textMuted, marginTop: -spacing[3], marginBottom: spacing[4] }]}>
              Files are private: only the attendee and people who manage attendees can open them. They're deleted 180 days after the event.
            </Text>
          </>
        ) : null}

        {!isSection && (parents.length > 0 || draft.showIfField) ? (
          <SettingsGroup title="Show this question" plain>
            <SettingsRow
              label="Always"
              trailing={!draft.showIfField ? <Check size={20} color={tokens.accent} weight="bold" /> : <View />}
              onPress={() => set({ showIfField: '', showIfAnyOf: [] })}
            />
            {parents.map((p) => (
              <SettingsRow
                key={p.id}
                label={`Depending on "${p.label}"`}
                trailing={draft.showIfField === p.id ? <Check size={20} color={tokens.accent} weight="bold" /> : <View />}
                onPress={() => set({ showIfField: p.id, showIfAnyOf: [] })}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {parent ? (
          <SettingsGroup title="Show when the answer is any of" plain>
            {choicesOf(parent).map((opt) => (
              <SwitchRow
                key={opt}
                label={opt}
                value={draft.showIfAnyOf.includes(opt)}
                onValueChange={(on) =>
                  set({ showIfAnyOf: on ? [...draft.showIfAnyOf, opt] : draft.showIfAnyOf.filter((x) => x !== opt) })
                }
              />
            ))}
          </SettingsGroup>
        ) : null}

        {!isSection ? (
          <SettingsGroup plain>
            <SwitchRow
              label="Required"
              hint={draft.type === 'YES_NO' ? 'Must be ticked, e.g. agreeing to the rules.' : undefined}
              value={draft.isRequired}
              onValueChange={(v) => set({ isRequired: v })}
            />
            {isGroup ? (
              <SwitchRow
                label="Ask once per group"
                hint={draft.perGroup ? 'Only the person booking answers.' : 'Every member answers.'}
                value={draft.perGroup}
                // A condition must be asked the same way, so switching clears it.
                onValueChange={(v) => set({ perGroup: v, showIfField: '', showIfAnyOf: [] })}
              />
            ) : null}
          </SettingsGroup>
        ) : null}

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
