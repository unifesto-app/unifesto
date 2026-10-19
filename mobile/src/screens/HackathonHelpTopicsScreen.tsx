import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import MultiChips from '../components/hackathon/MultiChips';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  createHelpTopic,
  deleteHelpTopic,
  getHelpTopics,
  staffName,
  updateHelpTopic,
  type HelpTopics,
} from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
type Topic = HelpTopics['topics'][number];

/**
 * Help topics teams raise queries under ("Food", "Wi-Fi"), each with its
 * points of contact from the event team. A query goes to the topic's POCs and
 * the volunteers in the team's room; "Other" goes to the curators.
 */
export default function HackathonHelpTopicsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<HelpTopics | null>(null);
  /** The topic being edited; null = the form adds a new one. */
  const [editing, setEditing] = useState<Topic | null>(null);
  const [name, setName] = useState('');
  const [pocs, setPocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getHelpTopics(eventId);
    if (res.ok) setData(res.data);
    else {
      setError(res.message);
      setData((d) => d ?? { staff: [], topics: [] });
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
    setPocs([]);
    setError('');
  };

  const save = async () => {
    if (!name.trim()) return setError('Name the topic, like "Food".');
    setBusy(true);
    const input = { name: name.trim(), pocUserIds: pocs };
    const res = editing ? await updateHelpTopic(eventId!, editing.id, input) : await createHelpTopic(eventId!, input);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    reset();
  };

  const remove = (t: Topic) =>
    AppAlert.alert(`Delete ${t.name}?`, 'Past queries keep the topic name. Teams can’t raise new ones under it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const res = await deleteHelpTopic(eventId!, t.id);
          setBusy(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          setData(res.data);
          reset();
        },
      },
    ]);

  if (!data) {
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
        <SettingsGroup title={editing ? `Edit ${editing.name}` : 'Add a topic'} plain>
          <FieldRow
            stacked
            label="Topic"
            value={name}
            onChangeText={(v) => {
              setError('');
              setName(v);
            }}
            placeholder="Food"
            maxLength={60}
          />
        </SettingsGroup>

        <SettingsGroup title="Points of contact" plain>
          {data.staff.length ? (
            <View style={styles.chips}>
              <MultiChips options={data.staff.map((u) => ({ value: u.id, label: staffName(u) }))} value={pocs} onChange={setPocs} />
            </View>
          ) : (
            <SettingsRow label="Add people to the event team first" onPress={() => router.push(`/manage/event/${eventId}/team`)} />
          )}
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Queries under this topic go to these people and to the volunteers in the team’s room. With nobody picked, they go to the curators.
        </Text>

        <View style={styles.actions}>
          <Button label={editing ? 'Save' : 'Add topic'} loading={busy} disabled={!name.trim()} onPress={() => void save()} style={{ flex: 1 }} />
          {editing ? <Button label="Cancel" variant="secondary" onPress={reset} style={{ flex: 1 }} /> : null}
        </View>
        {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}

        {data.topics.length === 0 ? (
          <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[6] }]}>
            No topics yet. Teams can still raise “Other” queries, which go to the curators.
          </Text>
        ) : (
          <SettingsGroup title="Topics" plain>
            {data.topics.map((t) => (
              <SettingsRow
                key={t.id}
                label={t.name}
                value={t.pocs.length ? t.pocs.map(staffName).join(', ') : 'Curators'}
                onPress={() =>
                  AppAlert.alert(t.name, t.pocs.length ? t.pocs.map(staffName).join(', ') : 'No POC yet', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Edit',
                      onPress: () => {
                        setEditing(t);
                        setName(t.name);
                        setPocs(t.pocs.map((p) => p.id));
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
  chips: { paddingVertical: spacing[2] },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
