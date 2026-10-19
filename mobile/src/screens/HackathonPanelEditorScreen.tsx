import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from '@unifesto/unicon/react-native';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import MultiChips from '../components/hackathon/MultiChips';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  createPanel,
  deletePanel,
  getJudges,
  getPanels,
  getRounds,
  updatePanel,
  type Judge,
  type Panel,
  type RoundRow,
} from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ANY_ROUND = '__any__';

interface Draft {
  name: string;
  roundId: string;
  memberUserIds: string[];
  location: string;
  meetingUrl: string;
  isAvailable: boolean;
}

const EMPTY: Draft = { name: '', roundId: ANY_ROUND, memberUserIds: [], location: '', meetingUrl: '', isAvailable: true };

/** Add or edit a panel: its judges, the round it serves, and where teams find it. */
export default function HackathonPanelEditorScreen() {
  const { eventId, panelId } = useLocalSearchParams<{ eventId: string; panelId: string }>();
  const isNew = !panelId || panelId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return;
    void getJudges(eventId).then((r) => r.ok && setJudges(r.data));
    void getRounds(eventId).then((r) => r.ok && setRounds(r.data));
    if (isNew) return;
    void getPanels(eventId).then((r) => {
      const found = r.ok ? r.data.find((p) => p.id === panelId) : undefined;
      if (!found) return setError('This panel no longer exists.');
      const d: Draft = {
        name: found.name,
        roundId: found.round?.id ?? ANY_ROUND,
        memberUserIds: found.members.map((m) => m.userId),
        location: found.location ?? '',
        meetingUrl: found.meetingUrl ?? '',
        isAvailable: found.isAvailable,
      };
      initial.current = JSON.stringify(d);
      setPanel(found);
      setDraft(d);
    });
  }, [isNew, eventId, panelId]);

  const title = isNew ? 'New panel' : panel?.name ?? 'Panel';
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
    if (!draft.name.trim()) return setError('Name the panel, like "Panel A".');
    const meetingUrl = draft.meetingUrl.trim();
    if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) return setError('The call link starts with https://');
    const body = {
      name: draft.name.trim(),
      roundId: draft.roundId === ANY_ROUND ? null : draft.roundId,
      memberUserIds: draft.memberUserIds,
      location: draft.location.trim() || null,
      meetingUrl: meetingUrl || null,
      isAvailable: draft.isAvailable,
    };
    setSaving(true);
    const res = isNew ? await createPanel(eventId!, body) : await updatePanel(eventId!, panelId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${panel?.name}?`, 'Only a panel with nobody in its queue can be deleted. Marks its judges gave are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deletePanel(eventId!, panelId!);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const panelRounds = rounds.filter((r) => r.judgingMode === 'PANEL');

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
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Panel A" />
        </SettingsGroup>

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>Judges on the panel</BlockTitle>
          {judges.length ? (
            <MultiChips
              options={judges.map((j) => ({ value: j.userId, label: j.name || j.contact || 'Judge' }))}
              value={draft.memberUserIds}
              onChange={(v) => set({ memberUserIds: v })}
            />
          ) : null}
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {judges.length
            ? 'A team’s slot finishes once every judge on the panel has given marks.'
            : 'Add judges first, then put them on panels.'}
        </Text>

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>Round</BlockTitle>
          <ChipPicker
            options={[{ value: ANY_ROUND, label: 'Every panel round' }, ...panelRounds.map((r) => ({ value: r.id, label: r.name }))]}
            value={draft.roundId}
            onChange={(v) => v && set({ roundId: v })}
          />
        </View>
        {!panelRounds.length ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>Set a round to be judged by a panel for teams to pick panels.</Text>
        ) : null}

        <SettingsGroup title="Where teams find it" plain>
          <FieldRow stacked label="Room or table (optional)" value={draft.location} onChangeText={(v) => set({ location: v })} placeholder="Seminar hall" />
          <FieldRow
            stacked
            label="Call link for online judging (optional)"
            value={draft.meetingUrl}
            onChangeText={(v) => set({ meetingUrl: v })}
            placeholder="https://meet.google.com/…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <SwitchRow label="Taking teams" value={draft.isAvailable} onValueChange={(v) => set({ isAvailable: v })} />
        </SettingsGroup>

        {!isNew ? (
          <Button
            label="Delete panel"
            variant="danger"
            size="lg"
            fullWidth
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>
      <SaveBar visible={dirty} label={isNew ? 'Add panel' : 'Save panel'} onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
