import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from 'phosphor-react-native';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import MultiChips from '../components/hackathon/MultiChips';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  addJudge,
  getJudge,
  getRounds,
  getThemes,
  removeJudge,
  updateJudge,
  type Judge,
  type RoundRow,
  type Theme,
} from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ALL_ROUNDS = '__all__';

interface Draft {
  by: 'mobile' | 'email';
  contact: string;
  name: string;
  themeIds: string[];
  /** Empty = every round. */
  roundIds: string[];
  location: string;
  meetingUrl: string;
  isAvailable: boolean;
}

const EMPTY: Draft = { by: 'mobile', contact: '', name: '', themeIds: [], roundIds: [], location: '', meetingUrl: '', isAvailable: true };

const toDraft = (j: Judge): Draft => ({
  by: 'mobile',
  contact: '',
  name: j.name ?? '',
  themeIds: j.themes.map((t) => t.id),
  roundIds: j.rounds?.map((r) => r.id) ?? [],
  location: j.location ?? '',
  meetingUrl: j.meetingUrl ?? '',
  isAvailable: j.isAvailable,
});

/**
 * Add a judge by phone number or email, or edit one: the themes they take,
 * which rounds they judge, where teams find them (a room / table, or a call
 * link for online judging), and whether they're on a break.
 */
export default function HackathonJudgeEditorScreen() {
  const { eventId, judgeId, kind: kindParam } = useLocalSearchParams<{ eventId: string; judgeId: string; kind?: string }>();
  const isNew = !judgeId || judgeId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [judge, setJudge] = useState<Judge | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonJudgeEditor');

  useEffect(() => {
    if (!eventId) return;
    void getThemes(eventId).then((r) => r.ok && setThemes(r.data));
    void getRounds(eventId).then((r) => r.ok && setRounds(r.data));
    if (isNew) return;
    void getJudge(eventId, judgeId!).then((r) => {
      if (!r.ok) return setError(r.message);
      const d = toDraft(r.data);
      initial.current = JSON.stringify(d);
      setJudge(r.data);
      setDraft(d);
    });
  }, [isNew, eventId, judgeId]);

  const mentor = isNew ? kindParam === 'MENTOR' : judge?.kind === 'MENTOR';
  const role = mentor ? 'mentor' : 'judge';
  const title = isNew ? `Add a ${role}` : judge?.name || judge?.contact || (mentor ? 'Mentor' : 'Judge');
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
    const meetingUrl = draft.meetingUrl.trim();
    if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) return setError('The call link starts with https://');
    const fields = {
      themeIds: draft.themeIds,
      roundIds: draft.roundIds.length ? draft.roundIds : null,
      location: draft.location.trim() || null,
      meetingUrl: meetingUrl || null,
    };
    setSaving(true);
    if (isNew) {
      const contact = draft.contact.trim();
      if (!contact) {
        setSaving(false);
        return setError(draft.by === 'mobile' ? 'Enter their phone number.' : 'Enter their email.');
      }
      const res = await addJudge(eventId!, {
        ...fields,
        ...(draft.by === 'mobile' ? { mobile: contact } : { email: contact }),
        name: draft.name.trim() || undefined,
        kind: mentor ? 'MENTOR' : 'JUDGE',
      });
      setSaving(false);
      if (!res.ok) return setError(res.message);
      return router.back();
    }
    const res = await updateJudge(eventId!, judgeId!, { ...fields, isAvailable: draft.isAvailable });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Remove ${judge?.name || `this ${role}`}?`, mentor ? 'They stop mentoring at this hackathon. Feedback they gave is kept.' : 'They stop judging this hackathon. Marks they already gave are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          const res = await removeJudge(eventId!, judgeId!);
          setRemoving(false);
          if (!res.ok) return AppAlert.alert("Couldn't remove", res.message);
          router.back();
        },
      },
    ]);

  const roundOptions = [{ value: ALL_ROUNDS, label: 'Every round' }, ...rounds.map((r) => ({ value: r.id, label: r.name }))];
  const roundValue = draft.roundIds.length ? draft.roundIds : [ALL_ROUNDS];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {isNew ? (
          <>
            <ChipPicker
              options={[
                { value: 'mobile' as const, label: 'Phone number' },
                { value: 'email' as const, label: 'Email' },
              ]}
              value={draft.by}
              onChange={(v) => v && set({ by: v, contact: '' })}
            />
            <SettingsGroup plain>
              <FieldRow
                stacked
                label={draft.by === 'mobile' ? 'Phone number' : 'Email'}
                value={draft.contact}
                onChangeText={(v) => set({ contact: v })}
                placeholder={draft.by === 'mobile' ? '98765 43210' : 'judge@example.com'}
                keyboardType={draft.by === 'mobile' ? 'phone-pad' : 'email-address'}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <FieldRow stacked label="Name (if they’re new to Unifesto)" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Dr. Asha Rao" />
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              If they already use Unifesto with this {draft.by === 'mobile' ? 'number' : 'email'}, it’s their account. If not, it becomes
              theirs when they sign in with it. A 10-digit number is taken as Indian (+91).
            </Text>
          </>
        ) : (
          <>
            <SettingsGroup plain>
              <SwitchRow
                label="Taking teams"
                hint="Off = on a break: teams can’t join their queue and they can’t call the next team."
                value={draft.isAvailable}
                onValueChange={(v) => set({ isAvailable: v })}
              />
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {judge?.contact ? `Added with ${judge.contact}. ` : ''}
              {judge?.signedIn ? 'They’ve signed in.' : 'They haven’t opened Unifesto yet.'}
              {judge && (judge.queue.waiting || judge.queue.busy) ? ` ${judge.queue.waiting} waiting in their queue.` : ''}
            </Text>
          </>
        )}

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>{mentor ? 'Themes they mentor' : 'Themes they judge'}</BlockTitle>
          {themes.length ? (
            <MultiChips options={themes.map((t) => ({ value: t.id, label: t.name }))} value={draft.themeIds} onChange={(v) => set({ themeIds: v })} />
          ) : null}
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {themes.length
            ? draft.themeIds.length
              ? 'Teams with these themes can pick them. Teams that typed their own theme can pick any judge.'
              : 'None picked: every team can pick them.'
            : 'No themes on your list, so every team can pick them.'}
        </Text>

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>Rounds</BlockTitle>
          <MultiChips
            options={roundOptions}
            value={roundValue}
            onChange={(v) => {
              // "Every round" and specific rounds exclude each other.
              const added = v.find((x) => !roundValue.includes(x));
              if (added === ALL_ROUNDS || v.length === 0) return set({ roundIds: [] });
              set({ roundIds: v.filter((x) => x !== ALL_ROUNDS) });
            }}
          />
        </View>

        <SettingsGroup title="Where teams find them" plain>
          <FieldRow stacked label="Room or table (optional)" value={draft.location} onChangeText={(v) => set({ location: v })} placeholder="Lab 2, table 4" />
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
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          A called team sees the room, or a Join call button when there’s a link.
          {mentor ? ' Mentors only take mentoring rounds.' : ' Judges only take judged rounds.'}
        </Text>

        {!isNew ? (
          <Button
            label={`Remove ${role}`}
            variant="danger"
            size="lg"
            fullWidth
            loading={removing}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>
      <SaveBar visible={dirty} label={isNew ? `Add ${role}` : `Save ${role}`} onPress={save} loading={saving} disabled={removing} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
