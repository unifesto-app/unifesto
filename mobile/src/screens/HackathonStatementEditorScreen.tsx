import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from 'phosphor-react-native';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createStatement,
  deleteStatement,
  getStatements,
  getThemes,
  updateStatement,
  type Statement,
  type Theme,
} from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

interface Draft {
  code: string;
  title: string;
  description: string;
  themeId: string;
  maxTeams: string;
}

const EMPTY: Draft = { code: '', title: '', description: '', themeId: '', maxTeams: '' };

/**
 * Add or edit one problem statement: code, title, what the problem is, its
 * theme (teams taking it get that theme), and an optional cap on teams.
 */
export default function HackathonStatementEditorScreen() {
  const { eventId, statementId } = useLocalSearchParams<{ eventId: string; statementId: string }>();
  const isNew = !statementId || statementId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [nextCode, setNextCode] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonStatementEditor');

  useEffect(() => {
    if (!eventId) return;
    void Promise.all([getStatements(eventId), getThemes(eventId)]).then(([s, t]) => {
      if (t.ok) setThemes(t.data);
      if (!s.ok) return setError(s.message);
      setNextCode(s.data.nextCode);
      if (isNew) return setDraft(EMPTY);
      const found = s.data.statements.find((x) => x.id === statementId);
      if (!found) return setError('This problem statement no longer exists.');
      const d: Draft = {
        code: found.code,
        title: found.title,
        description: found.description,
        themeId: found.theme?.id ?? '',
        maxTeams: found.maxTeams != null ? String(found.maxTeams) : '',
      };
      initial.current = JSON.stringify(d);
      setStatement(found);
      setDraft(d);
    });
  }, [isNew, eventId, statementId]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const title = isNew ? 'New problem statement' : statement?.code ?? 'Problem statement';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const dirty = isNew || JSON.stringify(draft) !== initial.current;

  const save = async () => {
    if (!draft.title.trim()) return setError('Give the problem statement a title.');
    const max = draft.maxTeams.trim() ? Number(draft.maxTeams) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) return setError('Max teams is a whole number, at least 1. Leave it blank for no limit.');
    if (!isNew && !draft.code.trim()) return setError('A statement needs a code.');
    const body = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      themeId: draft.themeId || null,
      maxTeams: max,
    };
    setSaving(true);
    const res = isNew
      ? await createStatement(eventId!, { ...body, code: draft.code.trim() || null })
      : await updateStatement(eventId!, statementId!, { ...body, code: draft.code.trim() });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${statement?.code}?`, 'Only a statement no team has can be deleted. Its code can be used again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteStatement(eventId!, statementId!);
          setDeleting(false);
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
          <FieldRow
            label="Code"
            value={draft.code}
            onChangeText={(v) => set({ code: v })}
            placeholder={isNew ? nextCode : ''}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
          />
          <FieldRow stacked label="Title" value={draft.title} onChangeText={(v) => set({ title: v })} placeholder="Clean water for villages" maxLength={200} />
          <FieldRow
            stacked
            multiline
            label="The problem"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="Who has the problem, what’s in the way, and what a good solution does."
            maxLength={4000}
          />
          <FieldRow
            label="Max teams (optional)"
            value={draft.maxTeams}
            onChangeText={(v) => set({ maxTeams: v })}
            keyboardType="number-pad"
            placeholder="No limit"
          />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {isNew ? `Leave the code blank to use ${nextCode}. ` : ''}Teams see the code, title, problem and theme. With a limit,
          the statement shows as full once that many teams have it.
        </Text>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Theme</BlockTitle>
          {themes.length ? (
            <ChipPicker
              options={themes.map((t) => ({ value: t.id, label: t.name }))}
              value={draft.themeId}
              onChange={(v) => set({ themeId: v })}
              clearable
            />
          ) : null}
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {themes.length
            ? 'Teams taking this statement get its theme. Without one, they pick a theme themselves.'
            : 'No themes yet. Add them from the hackathon screen to group statements by domain.'}
        </Text>

        {statement ? (
          <SettingsGroup title={`Teams · ${statement.taken}${statement.maxTeams != null ? ` of ${statement.maxTeams}` : ''}`} plain>
            {statement.teams.length === 0 ? <SettingsRow label="No team has it yet" /> : null}
            {statement.teams.map((t) => (
              <SettingsRow
                key={t.id}
                label={`${t.teamCode ?? '—'}  ${t.name}`}
                onPress={() => router.push(`/manage/event/${eventId}/hackathon/team/${t.id}`)}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {!isNew ? (
          <Button
            label="Delete problem statement"
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? 'Add statement' : 'Save statement'} onPress={save} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
