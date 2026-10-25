import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowCounterClockwise, LockSimple, WarningCircle } from '@unifesto/unicon/react-native';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import StatementCard from '../components/hackathon/StatementCard';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  assignTeamStatement,
  getStatements,
  getTeam,
  getThemes,
  unlockTeamStatement,
  type SetStatementInput,
  type StatementList,
  type TeamDetail,
  type Theme,
} from '../lib/api/hackathon';
import { formatWhen, placesLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];

type Source = 'LIST' | 'OWN';
const SOURCES: { value: Source; label: string }[] = [
  { value: 'LIST', label: 'From your list' },
  { value: 'OWN', label: 'Write one' },
];

/**
 * The curator sets a team's problem statement and theme: one from the list or
 * written for them, in any mode and after the deadline. It locks for the team
 * straight away. "Let the team choose again" clears it and reopens the choice.
 */
export default function HackathonTeamStatementScreen() {
  const { eventId, teamId } = useLocalSearchParams<{ eventId: string; teamId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [list, setList] = useState<StatementList | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const [source, setSource] = useState<Source>('LIST');
  const [pickedId, setPickedId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [themeId, setThemeId] = useState('');
  const [themeText, setThemeText] = useState('');

  useEffect(() => {
    if (!eventId || !teamId) return;
    void Promise.all([getTeam(eventId, teamId), getStatements(eventId), getThemes(eventId)]).then(([t, s, th]) => {
      if (!t.ok) return setError(t.message);
      if (!s.ok) return setError(s.message);
      if (th.ok) setThemes(th.data);
      const cur = t.data.statement;
      setTeam(t.data);
      setList(s.data);
      // Start from what the team has, so a small correction is a small edit.
      setSource(cur?.source ?? (s.data.statements.length ? 'LIST' : 'OWN'));
      setPickedId(cur?.statementId ?? '');
      setTitle(cur?.source === 'OWN' ? cur.title : '');
      setDescription(cur?.source === 'OWN' ? cur.description : '');
      setThemeId(cur?.theme && !cur.statementId ? cur.theme.id : '');
      setThemeText(cur?.themeText ?? '');
    });
  }, [eventId, teamId]);

  if (!team || !list) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? <Text style={[styles.note, { color: c.muted }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const cur = team.statement;
  const cancelled = team.stage === 'CANCELLED';
  const picked = source === 'LIST' ? list.statements.find((s) => s.id === pickedId) ?? null : null;
  const needsTheme = list.themeMode === 'TEXT' ? !picked?.theme : !picked?.theme && themes.length > 0;

  const assign = () => {
    const input: SetStatementInput = {};
    if (source === 'LIST') {
      if (!picked) return setError('Pick a statement.');
      input.statementId = picked.id;
    } else {
      if (!title.trim()) return setError('Give the statement a title.');
      if (!description.trim()) return setError('Describe the problem.');
      input.title = title.trim();
      input.description = description.trim();
    }
    if (needsTheme) {
      if (list.themeMode === 'TEXT') {
        if (!themeText.trim()) return setError('Add a theme.');
        input.themeText = themeText.trim();
      } else {
        if (!themeId) return setError('Pick a theme.');
        input.themeId = themeId;
      }
    }
    AppAlert.alert(
      cur ? 'Change this team’s statement?' : 'Assign this statement?',
      `${team.teamCode ?? team.name} is notified and it’s locked for them.${cur ? ' If they were already evaluated, their marks stay and results show the change.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: cur ? 'Change' : 'Assign',
          onPress: async () => {
            setSaving(true);
            const res = await assignTeamStatement(eventId!, teamId!, input);
            setSaving(false);
            if (!res.ok) return setError(res.message);
            router.back();
          },
        },
      ],
    );
  };

  const unlock = () =>
    AppAlert.alert(
      'Let the team choose again?',
      'Their statement and theme are cleared (freeing its place on the list) and they’re notified. Until they lock one in again, they can’t be judged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          style: 'destructive',
          onPress: async () => {
            setUnlocking(true);
            const res = await unlockTeamStatement(eventId!, teamId!);
            setUnlocking(false);
            if (!res.ok) return AppAlert.alert("Couldn't reopen", res.message);
            router.back();
          },
        },
      ],
    );

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    setError('');
    fn(v);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: team.teamCode ?? 'Problem statement' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: c.text }]} numberOfLines={2}>
          {team.name}
        </Text>

        {cur ? (
          <>
            <View style={styles.status}>
              <LockSimple size={16} color={c.success} weight="fill" />
              <Text style={[styles.statusText, { color: c.success }]}>
                {cur.setBy?.kind === 'ORGANISER' ? 'Assigned by organisers' : `Locked in${cur.setBy?.name ? ` by ${cur.setBy.name}` : ''}`}
                {cur.lockedAt ? ` · ${formatWhen(cur.lockedAt)}` : ''}
              </Text>
            </View>
            <StatementCard code={cur.code} title={cur.title} description={cur.description} theme={cur.themeLabel} />
            {cur.changedAfterEvalAt ? (
              <View style={styles.status}>
                <WarningCircle size={16} color={c.warn} weight="fill" />
                <Text style={[styles.statusText, { color: c.warn }]}>
                  Changed after evaluation ({formatWhen(cur.changedAfterEvalAt)}). Earlier marks were kept.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.note, { color: c.muted }]}>No problem statement yet.</Text>
        )}

        {cancelled ? (
          <Text style={[styles.note, { color: c.danger, marginTop: spacing[5] }]}>
            This team’s registration was cancelled, so it can’t be given a statement.
          </Text>
        ) : (
          <>
            <View style={{ marginTop: spacing[8] }}>
              <BlockTitle>{cur ? 'Change it to' : 'Assign'}</BlockTitle>
              <ChipPicker options={SOURCES} value={source} onChange={set((v: Source | '') => v && setSource(v))} />
            </View>

            {source === 'LIST' ? (
              list.statements.length === 0 ? (
                <Text style={[styles.note, { color: c.muted }]}>Your list is empty. Add statements first, or write one.</Text>
              ) : (
                list.statements.map((s) => {
                  const mine = s.id === cur?.statementId;
                  const full = s.placesLeft === 0 && !mine;
                  return (
                    <StatementCard
                      key={s.id}
                      code={s.code}
                      title={s.title}
                      description={s.description}
                      theme={s.theme?.name}
                      note={mine ? 'Current' : placesLabel(s.placesLeft)}
                      selected={s.id === pickedId}
                      disabled={full}
                      onPress={
                        full
                          ? undefined
                          : () => {
                              setError('');
                              setPickedId(s.id);
                            }
                      }
                    />
                  );
                })
              )
            ) : (
              <SettingsGroup plain>
                <FieldRow stacked label="Title" value={title} onChangeText={set(setTitle)} maxLength={200} />
                <FieldRow stacked multiline label="The problem" value={description} onChangeText={set(setDescription)} maxLength={4000} />
              </SettingsGroup>
            )}

            {needsTheme && (source === 'OWN' || picked) ? (
              list.themeMode === 'TEXT' ? (
                <SettingsGroup title="Theme" plain>
                  <FieldRow stacked label="Theme or domain" value={themeText} onChangeText={set(setThemeText)} maxLength={60} />
                </SettingsGroup>
              ) : (
                <View style={{ marginTop: spacing[6] }}>
                  <BlockTitle>Theme</BlockTitle>
                  <ChipPicker
                    options={themes.map((t) => ({ value: t.id, label: t.name }))}
                    value={themeId}
                    onChange={set((v: string) => setThemeId(v))}
                  />
                </View>
              )
            ) : null}

            <Button
              label={cur ? 'Change and lock' : 'Assign and lock'}
              size="lg"
              fullWidth
              loading={saving}
              disabled={unlocking || (source === 'LIST' && !picked)}
              onPress={assign}
              style={{ marginTop: spacing[6] }}
            />
            {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}

            {cur ? (
              <Button
                label="Let the team choose again"
                variant="secondary"
                size="lg"
                fullWidth
                loading={unlocking}
                disabled={saving}
                icon={<ArrowCounterClockwise size={18} color={c.text} weight="bold" />}
                onPress={unlock}
                style={{ marginTop: spacing[4] }}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  heading: { fontSize: typography.fontSize.xl, ...cosmosFont.strong },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3], marginHorizontal: spacing[1] },
  statusText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
