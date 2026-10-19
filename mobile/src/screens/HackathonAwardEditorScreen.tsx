import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, CircleDashed, EyeSlash, Trash } from '@unifesto/unicon/react-native';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { createAward, deleteAward, getAwards, unpublishAward, updateAward, type Award, type AwardsList } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

interface Draft {
  title: string;
  entrantId: string;
  notes: string;
}

const EMPTY: Draft = { title: '', entrantId: '', notes: '' };

/** Declare or edit an award: its name, the winning team, and why it won. */
export default function HackathonAwardEditorScreen() {
  const { eventId, awardId } = useLocalSearchParams<{ eventId: string; awardId: string }>();
  const isNew = !awardId || awardId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [list, setList] = useState<AwardsList | null>(null);
  const [award, setAward] = useState<Award | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return;
    void getAwards(eventId).then((r) => {
      if (!r.ok) return setError(r.message);
      setList(r.data);
      if (isNew) return setDraft(EMPTY);
      const found = r.data.awards.find((a) => a.id === awardId);
      if (!found) return setError('This award no longer exists.');
      const d = { title: found.title, entrantId: found.team.id, notes: found.notes ?? '' };
      initial.current = JSON.stringify(d);
      setAward(found);
      setDraft(d);
    });
  }, [isNew, eventId, awardId]);

  const teams = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = list?.teams ?? [];
    return q ? all.filter((t) => `${t.teamCode ?? ''} ${t.name}`.toLowerCase().includes(q)) : all;
  }, [list, search]);

  const title = isNew ? 'New award' : award?.title ?? 'Award';
  if (!draft || !list) {
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
  const locked = !!award?.published;
  const picked = list.teams.find((t) => t.id === draft.entrantId) ?? (award ? award.team : null);

  const save = async () => {
    if (!draft.title.trim()) return setError('Name the award, like "Winner" or "Best design".');
    if (!draft.entrantId) return setError('Pick the winning team.');
    setSaving(true);
    const body = { title: draft.title.trim(), entrantId: draft.entrantId, notes: draft.notes.trim() || null };
    const res = isNew ? await createAward(eventId!, body) : await updateAward(eventId!, awardId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const unpublish = () =>
    AppAlert.alert('Unpublish this award?', 'Teams stop seeing it until you publish again. Nobody is notified.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpublish',
        style: 'destructive',
        onPress: async () => {
          const res = await unpublishAward(eventId!, awardId!);
          if (!res.ok) return AppAlert.alert("Couldn't unpublish", res.message);
          const found = res.data.awards.find((a) => a.id === awardId) ?? null;
          setAward(found);
          setList(res.data);
        },
      },
    ]);

  const remove = () =>
    AppAlert.alert(`Delete ${award?.title}?`, 'The award is removed. Nobody is notified.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteAward(eventId!, awardId!);
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
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup plain>
          <FieldRow stacked label="Award" value={draft.title} onChangeText={(v) => set({ title: v })} placeholder="Winner" />
          <FieldRow
            stacked
            multiline
            label="Notes (shown with the winner)"
            value={draft.notes}
            onChangeText={(v) => set({ notes: v })}
            placeholder="Best end-to-end demo, and a pitch the jury loved."
          />
        </SettingsGroup>

        <SettingsGroup title={picked ? `Team · ${picked.teamCode ?? ''} ${picked.name}`.trim() : 'Pick the team'}>
          {locked ? (
            <SettingsRow label="Published: unpublish to change the team" />
          ) : (
            <>
              {list.teams.length > 8 ? (
                <View style={styles.searchWrap}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search Team ID or name"
                    placeholderTextColor={tokens.textMuted}
                    style={[styles.search, { color: tokens.text, backgroundColor: tokens.fill }]}
                    autoCorrect={false}
                  />
                </View>
              ) : null}
              {teams.map((t) => (
                <SettingsRow
                  key={t.id}
                  icon={
                    t.id === draft.entrantId ? (
                      <CheckCircle size={24} color={tokens.accent} weight="fill" />
                    ) : (
                      <CircleDashed size={24} color={tokens.textMuted} />
                    )
                  }
                  label={`${t.teamCode ?? '—'}  ${t.name}`}
                  onPress={() => set({ entrantId: t.id })}
                />
              ))}
              {!teams.length ? <SettingsRow label="No teams match" /> : null}
            </>
          )}
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>Any team that took part can win, whatever its rank.</Text>

        {award?.published ? (
          <Button
            label="Unpublish"
            variant="secondary"
            size="lg"
            fullWidth
            icon={<EyeSlash size={18} color={tokens.text} weight="bold" />}
            onPress={unpublish}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
        {!isNew && !award?.published ? (
          <Button
            label="Delete award"
            variant="danger"
            size="lg"
            fullWidth
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>
      <SaveBar visible={dirty} label={isNew ? 'Add award' : 'Save award'} onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  searchWrap: { padding: spacing[3] },
  search: { borderRadius: 12, paddingHorizontal: spacing[3], paddingVertical: spacing[2], fontSize: typography.fontSize.base, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
