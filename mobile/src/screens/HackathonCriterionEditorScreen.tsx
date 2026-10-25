import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from '@unifesto/unicon/react-native';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { addCriterion, deleteCriterion, getRound, updateCriterion, type Criterion } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

interface Draft {
  label: string;
  maxValue: string;
  weight: string;
}

const EMPTY: Draft = { label: '', maxValue: '10', weight: '1' };

/** Add or edit one criterion of a round: its name, the top mark, and its weight. */
export default function HackathonCriterionEditorScreen() {
  const { eventId, roundId, metricId } = useLocalSearchParams<{ eventId: string; roundId: string; metricId?: string }>();
  const isNew = !metricId;
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [criterion, setCriterion] = useState<Criterion | null>(null);
  // Once any judge has marked the round, only the name can change.
  const [locked, setLocked] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId || !roundId) return;
    void getRound(eventId, roundId).then((r) => {
      if (r.ok) setLocked(r.data.criteriaLocked);
      if (isNew) return;
      const found = r.ok ? r.data.criteria.find((c) => c.id === metricId) : undefined;
      if (!found) return setError('This criterion no longer exists.');
      const d = { label: found.label, maxValue: String(found.maxValue), weight: String(found.weight) };
      initial.current = JSON.stringify(d);
      setCriterion(found);
      setDraft(d);
    });
  }, [isNew, eventId, roundId, metricId]);

  const title = isNew ? 'New criterion' : 'Criterion';
  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const dirty = isNew || JSON.stringify(draft) !== initial.current;

  const save = async () => {
    const maxValue = Number(draft.maxValue);
    const weight = Number(draft.weight.replace(',', '.'));
    if (isNew && locked) return setError('Judges have started marking this round, so no criteria can be added.');
    if (!draft.label.trim()) return setError('Name it, like "Innovation" or "Presentation".');
    if (!Number.isFinite(maxValue) || maxValue < 1 || maxValue > 1000) return setError('The top mark is between 1 and 1000.');
    if (!Number.isFinite(weight) || weight < 0.1 || weight > 100) return setError('The weight is between 0.1 and 100.');
    const body = { label: draft.label.trim(), maxValue, weight };
    setSaving(true);
    const res = isNew ? await addCriterion(eventId!, roundId!, body) : await updateCriterion(eventId!, roundId!, metricId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${criterion?.label}?`, 'Only a criterion nobody has given marks for can be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteCriterion(eventId!, roundId!, metricId!);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup plain>
          <FieldRow stacked label="Name" value={draft.label} onChangeText={(v) => set({ label: v })} placeholder="Innovation" />
          <FieldRow label="Top mark" value={draft.maxValue} onChangeText={(v) => set({ maxValue: v })} keyboardType="number-pad" editable={!locked} />
          <FieldRow label="Weight" value={draft.weight} onChangeText={(v) => set({ weight: v })} keyboardType="decimal-pad" editable={!locked} />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Judges give 0 to the top mark. Weight 2 counts twice as much as weight 1.
          {locked ? ' Judges have started marking this round, so the top mark and weight are locked.' : ''}
          {criterion?.allRounds ? ' This criterion applies to every round.' : ''}
        </Text>
        {!isNew && !locked && !criterion?.marked ? (
          <Button
            label="Delete criterion"
            variant="danger"
            size="lg"
            fullWidth
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>
      <SaveBar visible={dirty} label={isNew ? 'Add criterion' : 'Save criterion'} onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
