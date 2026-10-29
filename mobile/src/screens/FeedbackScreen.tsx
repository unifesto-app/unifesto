import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomFieldInput from '../components/CustomFieldInput';
import { BlockTitle } from '../components/manage/FormFields';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { getFeedback, submitFeedback, toCustomField, type FeedbackForm } from '../lib/api/feedback';
import { selectionTick } from '../lib/haptics';
import { firstFormProblem, visibleFields } from '../utils/formQuestions';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

/** A row of numbered cells, `from`..`to`; tapping the picked one clears it. */
function Scale({ from, to, value, onChange }: { from: number; to: number; value: number | null; onChange: (v: number | null) => void }) {
  const c = useCosmos();
  return (
    <View style={styles.scale}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => {
        const on = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => {
              selectionTick();
              onChange(on ? null : n);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${n} of ${to}`}
            style={[styles.cell, { backgroundColor: on ? c.primary : c.raised, borderColor: on ? c.primary : c.input }]}
          >
            <Text style={[styles.cellText, { color: on ? c.primaryFg : c.text }]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** F1: rate an event I attended (1-5, NPS 0-10, comment, the curators' questions). */
export default function FeedbackScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCosmos();
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    void getFeedback(eventId).then((r) => {
      if (!r.ok) return setLoadError(r.message);
      setForm(r.data);
      const mine = r.data.response;
      if (mine) {
        setRating(mine.rating);
        setNps(mine.nps);
        setComment(mine.comment ?? '');
        setAnswers(mine.answers ?? {});
      }
    });
  }, [eventId]);

  const fields = useMemo(() => (form ? form.questions.map((q) => toCustomField(q, form.event.id)) : []), [form]);

  const submit = async () => {
    setError('');
    if (!rating) return setError('Pick a rating from 1 to 5.');
    const problem = firstFormProblem(fields, answers);
    if (problem) return setError(problem);
    setSaving(true);
    const r = await submitFeedback(eventId!, { rating, nps, comment: comment.trim() || undefined, answers });
    setSaving(false);
    if (!r.ok) return setError(r.message);
    AppAlert.alert('Thanks!', 'Your feedback goes to the event team.');
    router.back();
  };

  if (!form) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Feedback' }} />
        {loadError ? (
          <Text style={[styles.muted, { color: c.soft }]}>{loadError}</Text>
        ) : (
          <ActivityIndicator color={c.primary} style={{ marginTop: spacing[8] }} />
        )}
      </CosmosScreen>
    );
  }

  if (!form.open) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Feedback' }} />
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.muted, { color: c.soft }]}>
            {!form.enabled
              ? 'This event is not collecting feedback.'
              : new Date(form.closesAt) < new Date()
                ? 'Feedback for this event has closed.'
                : 'Feedback opens for attendees once the event starts.'}
          </Text>
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen keyboard keyboardDismissMode="interactive" bottom={60 + insets.bottom} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Feedback' }} />
      <Text style={[styles.title, { color: c.text }]}>{form.event.title}</Text>
      <Text style={[styles.hint, { color: c.muted, marginTop: spacing[1] }]}>
        {form.unlocksCertificate ? 'Sending this unlocks your certificate. ' : ''}Open until{' '}
        {new Date(form.closesAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.
      </Text>

      <View style={styles.block}>
        <BlockTitle>How was it?</BlockTitle>
        <Scale from={1} to={5} value={rating} onChange={setRating} />
      </View>

      <View style={styles.block}>
        <BlockTitle>How likely are you to recommend it to a friend?</BlockTitle>
        <Scale from={0} to={10} value={nps} onChange={setNps} />
        <View style={styles.ends}>
          <Text style={[styles.hint, { color: c.muted }]}>Not likely</Text>
          <Text style={[styles.hint, { color: c.muted }]}>Very likely</Text>
        </View>
      </View>

      {fields.length ? (
        <View style={styles.block}>
          {visibleFields(fields, answers).map((f) => (
            <CustomFieldInput key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <BlockTitle>Anything else? (optional)</BlockTitle>
        <TextInput
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={2000}
          placeholder="What worked, what to improve"
          placeholderTextColor={c.muted}
          selectionColor={c.primary}
          style={[styles.comment, { color: c.text, backgroundColor: c.raised }]}
        />
      </View>

      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
      <Button
        label={form.response ? 'Update feedback' : 'Send feedback'}
        size="lg"
        fullWidth
        loading={saving}
        onPress={() => void submit()}
        style={{ marginTop: spacing[5] }}
      />
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], marginTop: spacing[4] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  title: { marginTop: spacing[2], fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.display },
  block: { marginTop: spacing[6] },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  cell: { minWidth: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: cosmosRadius, borderWidth: 1 },
  cellText: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[1] },
  hint: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  comment: { marginTop: spacing[2], minHeight: 96, borderRadius: cosmosRadius, padding: spacing[3], textAlignVertical: 'top', fontSize: typography.fontSize.base, ...cosmosFont.body },
  error: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
