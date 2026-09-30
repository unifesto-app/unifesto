import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { createTheme, deleteTheme, getThemes, updateTheme, type Theme } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/** "2 statements · 5 teams" */
const usage = (t: Theme) =>
  [
    t.statements ? `${t.statements} statement${t.statements === 1 ? '' : 's'}` : '',
    t.teams ? `${t.teams} team${t.teams === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ') || undefined;

/**
 * Themes / domains for the hackathon, e.g. "HealthTech". Statements can carry
 * one; teams whose statement has none pick from this list. Themes are just
 * names, so they're added, renamed and deleted right here.
 */
export default function HackathonThemesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [themes, setThemes] = useState<Theme[] | null>(null);
  /** The theme being renamed; null = the field adds a new one. */
  const [editing, setEditing] = useState<Theme | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonThemes');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getThemes(eventId);
    if (res.ok) setThemes(res.data);
    else {
      setError(res.message);
      setThemes((t) => t ?? []);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reset = () => {
    setEditing(null);
    setName('');
    setError('');
  };

  const save = async () => {
    if (!name.trim()) return setError('Name the theme, like "HealthTech".');
    setBusy(true);
    const res = editing ? await updateTheme(eventId!, editing.id, name.trim()) : await createTheme(eventId!, name.trim());
    setBusy(false);
    if (!res.ok) return setError(res.message);
    reset();
    void load();
  };

  const remove = (t: Theme) =>
    AppAlert.alert(
      `Delete ${t.name}?`,
      t.statements
        ? `${t.statements} statement${t.statements === 1 ? '' : 's'} lose${t.statements === 1 ? 's' : ''} this theme, and teams taking ${t.statements === 1 ? 'it' : 'them'} pick one themselves. A theme a team has can’t be deleted.`
        : 'A theme a team has can’t be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const res = await deleteTheme(eventId!, t.id);
            setBusy(false);
            if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
            reset();
            void load();
          },
        },
      ],
    );

  if (!themes) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 100 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup title={editing ? `Rename ${editing.name}` : 'Add a theme'} plain>
          <FieldRow
            stacked
            label="Theme"
            value={name}
            onChangeText={(v) => {
              setError('');
              setName(v);
            }}
            placeholder="HealthTech"
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
        </SettingsGroup>
        <View style={styles.actions}>
          <Button label={editing ? 'Save' : 'Add theme'} loading={busy} disabled={!name.trim()} onPress={() => void save()} style={{ flex: 1 }} />
          {editing ? <Button label="Cancel" variant="secondary" onPress={reset} style={{ flex: 1 }} /> : null}
        </View>
        {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}

        {themes.length === 0 ? (
          <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[6] }]}>
            No themes yet. Without any, teams skip the theme when they choose a statement.
          </Text>
        ) : (
          <SettingsGroup title="Themes" plain>
            {themes.map((t) => (
              <SettingsRow
                key={t.id}
                label={t.name}
                value={usage(t)}
                onPress={() =>
                  AppAlert.alert(t.name, usage(t) ?? 'Not used yet', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Rename',
                      onPress: () => {
                        setEditing(t);
                        setName(t.name);
                        setError('');
                      },
                    },
                    { text: 'Delete', style: 'destructive', onPress: () => remove(t) },
                  ])
                }
              />
            ))}
          </SettingsGroup>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
