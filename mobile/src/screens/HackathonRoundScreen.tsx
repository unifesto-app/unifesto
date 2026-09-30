import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, CircleDashed, Pause, Play, Plus, Stop, Trash, XCircle } from 'phosphor-react-native';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import DateTimeRow from '../components/manage/DateTimeRow';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useHackathonSocket from '../hooks/useHackathonSocket';
import {
  createRound,
  deleteRound,
  getRound,
  setRoundStatus,
  setTeamDecision,
  updateRound,
  type JudgingMode,
  type RoundDetail,
  type RoundStatus,
  type Standing,
} from '../lib/api/hackathon';
import { JUDGING_MODE_OPTIONS, evalStatusLabel, roundStatusLabel, standingLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;

interface Draft {
  name: string;
  judgingMode: JudgingMode;
  requiredEvaluations: string;
  slotMinutes: string;
  callGraceMinutes: string;
  eliminationEnabled: boolean;
  countsTowardTotal: boolean;
  /** ISO string; '' = no end time. */
  endAt: string;
}

const EMPTY: Draft = {
  name: '',
  judgingMode: 'SINGLE',
  requiredEvaluations: '2',
  slotMinutes: '10',
  callGraceMinutes: '3',
  eliminationEnabled: true,
  countsTowardTotal: true,
  endAt: '',
};

const toDraft = (r: RoundDetail): Draft => ({
  name: r.name,
  judgingMode: r.judgingMode,
  requiredEvaluations: String(Math.max(2, r.requiredEvaluations)),
  slotMinutes: String(r.slotMinutes),
  callGraceMinutes: String(r.callGraceMinutes),
  eliminationEnabled: r.eliminationEnabled,
  countsTowardTotal: r.countsTowardTotal,
  endAt: r.endAt ?? '',
});

/**
 * One round: how it's judged (one judge / panel / several judges, slot and
 * grace times, elimination, end time), its criteria, opening and closing it,
 * and advancing or eliminating its teams. Marks aren't shown here.
 */
export default function HackathonRoundScreen() {
  const { eventId, roundId } = useLocalSearchParams<{ eventId: string; roundId: string }>();
  const isNew = !roundId || roundId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [round, setRound] = useState<RoundDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonRound');

  const apply = useCallback((r: RoundDetail, resetDraft: boolean) => {
    setRound(r);
    if (resetDraft) {
      const d = toDraft(r);
      initial.current = JSON.stringify(d);
      setDraft(d);
    }
  }, []);

  const load = useCallback(async () => {
    if (isNew || !eventId) return;
    const res = await getRound(eventId, roundId!);
    if (!res.ok) return setError(res.message);
    // Keep the curator's unsaved edits; refresh everything else.
    setDraft((d) => {
      const clean = !d || JSON.stringify(d) === initial.current;
      if (clean) {
        const next = toDraft(res.data);
        initial.current = JSON.stringify(next);
        return next;
      }
      return d;
    });
    setRound(res.data);
  }, [isNew, eventId, roundId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHackathonSocket(isNew ? undefined : eventId, () => void load());

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const title = isNew ? 'New round' : round?.name ?? 'Round';

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
    const slot = Number(draft.slotMinutes);
    const grace = Number(draft.callGraceMinutes);
    const needed = Number(draft.requiredEvaluations);
    if (!draft.name.trim()) return setError('Name the round, like "Round 2" or "Finals".');
    if (!Number.isInteger(slot) || slot < 1 || slot > 240) return setError('A slot is 1 to 240 minutes.');
    if (!Number.isInteger(grace) || grace < 0 || grace > 60) return setError('The grace time is 0 to 60 minutes.');
    if (draft.judgingMode === 'MULTI' && (!Number.isInteger(needed) || needed < 2 || needed > 10)) {
      return setError('With several judges, each team needs 2 to 10 evaluations.');
    }
    const body = {
      name: draft.name.trim(),
      judgingMode: draft.judgingMode,
      ...(draft.judgingMode === 'MULTI' ? { requiredEvaluations: needed } : {}),
      slotMinutes: slot,
      callGraceMinutes: grace,
      eliminationEnabled: draft.eliminationEnabled,
      countsTowardTotal: draft.countsTowardTotal,
      endAt: draft.endAt || null,
    };
    setSaving(true);
    const res = isNew ? await createRound(eventId!, body) : await updateRound(eventId!, roundId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    if (isNew) {
      router.replace({ pathname: `/manage/event/${eventId}/hackathon/round`, params: { roundId: res.data.id } });
    } else {
      apply(res.data, true);
    }
  };

  const changeStatus = (to: RoundStatus) => {
    if (!round) return;
    const open = round.openRequests;
    const copy: Record<RoundStatus, { title: string; body: string; action: string }> = {
      ACTIVE: {
        title: `Open ${round.name}?`,
        body: 'Teams in this round can join judges’ queues, and teams and judges are notified.',
        action: 'Open round',
      },
      PENDING: {
        title: `Pause ${round.name}?`,
        body: open
          ? `${open} team${open === 1 ? ' is' : 's are'} in a queue or slot. They lose their place and are told. You can open the round again.`
          : 'Teams can’t join queues until you open it again.',
        action: 'Pause',
      },
      CLOSED: {
        title: `Close ${round.name}?`,
        body: open
          ? `${open} team${open === 1 ? ' is' : 's are'} still in a queue or slot. Closing cancels ${open === 1 ? 'it' : 'them'}, and judges can’t change marks any more.`
          : 'Judging for this round ends and judges can no longer change their marks.',
        action: 'Close round',
      },
    };
    const c = copy[to];
    AppAlert.alert(c.title, c.body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: c.action,
        style: to === 'ACTIVE' ? 'default' : 'destructive',
        onPress: async () => {
          setActing(true);
          const res = await setRoundStatus(eventId!, roundId!, to);
          setActing(false);
          if (!res.ok) return AppAlert.alert("Couldn't change the round", res.message);
          apply(res.data, false);
        },
      },
    ]);
  };

  const decide = (team: RoundDetail['teams'][number]) => {
    const setTo = async (status: Standing) => {
      const res = await setTeamDecision(eventId!, roundId!, team.id, status);
      if (!res.ok) return AppAlert.alert("Couldn't save", res.message);
      apply(res.data, false);
    };
    AppAlert.alert(
      [team.teamCode, team.name].filter(Boolean).join(' · '),
      `${standingLabel(team.standing)} in ${round?.name}. ${team.evaluations}/${team.required} evaluation${team.required === 1 ? '' : 's'}.`,
      [
        { text: 'Advance', onPress: () => void setTo('ADVANCED') },
        { text: 'Eliminate', style: 'destructive', onPress: () => void setTo('ELIMINATED') },
        ...(team.standing !== 'PENDING' ? [{ text: 'Undecided', onPress: () => void setTo('PENDING') }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const remove = () =>
    AppAlert.alert(`Delete ${round?.name}?`, 'Only a round nobody has been evaluated in can be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteRound(eventId!, roundId!);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const mode = JUDGING_MODE_OPTIONS.find((o) => o.value === draft.judgingMode);
  const icon = (I: typeof Play, color = tokens.accent) => <I size={ICON} color={color} weight="fill" />;
  const criteriaUrl = (metricId?: string) => ({
    pathname: `/manage/event/${eventId}/hackathon/criterion`,
    params: { roundId: roundId!, ...(metricId ? { metricId } : {}) },
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {round ? (
          <>
            <SettingsGroup title={`Status · ${roundStatusLabel(round.status)}`}>
              {round.status !== 'ACTIVE' ? (
                <SettingsRow
                  icon={icon(Play, tokens.success)}
                  label={round.status === 'CLOSED' ? 'Open again' : 'Open round'}
                  value={round.blockers.length ? 'Waiting on decisions' : undefined}
                  onPress={acting ? undefined : () => changeStatus('ACTIVE')}
                />
              ) : (
                <>
                  <SettingsRow icon={icon(Pause, tokens.warning)} label="Pause" onPress={acting ? undefined : () => changeStatus('PENDING')} />
                  <SettingsRow icon={icon(Stop, tokens.danger)} label="Close round" danger onPress={acting ? undefined : () => changeStatus('CLOSED')} />
                </>
              )}
            </SettingsGroup>
            {round.blockers.map((b) => (
              <Text key={b.roundId} style={[styles.note, { color: tokens.warning }]}>
                Decide every team in {b.roundName} first: {b.teams.slice(0, 6).map((t) => t.teamCode ?? t.name).join(', ')}
                {b.teams.length > 6 ? ` and ${b.teams.length - 6} more` : ''}.
              </Text>
            ))}
            {round.status !== 'ACTIVE' && !round.criteria.length ? (
              <Text style={[styles.note, { color: tokens.warning }]}>Add at least one criterion before opening.</Text>
            ) : null}
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {round.judgingMode === 'PANEL'
                ? `${round.panels} panel${round.panels === 1 ? '' : 's'} can take this round.`
                : `${round.judges} judge${round.judges === 1 ? '' : 's'} judge this round.`}
              {round.openRequests ? ` ${round.openRequests} in queues now.` : ''}
            </Text>

            <SettingsGroup title="Criteria">
              {round.criteria.map((c) => (
                <SettingsRow
                  key={c.id}
                  label={c.label}
                  value={`out of ${c.maxValue}${c.weight !== 1 ? ` · ×${c.weight}` : ''}${c.allRounds ? ' · all rounds' : ''}`}
                  onPress={() => router.push(criteriaUrl(c.id))}
                />
              ))}
              <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="Add a criterion" onPress={() => router.push(criteriaUrl())} />
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Judges give a mark for every criterion. A team’s evaluation is the weighted total.
            </Text>
          </>
        ) : null}

        <SettingsGroup title="Round" plain>
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Round 2" />
        </SettingsGroup>

        <View style={{ marginTop: spacing[6] }}>
          <BlockTitle>How teams are judged</BlockTitle>
          <ChipPicker
            options={JUDGING_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.judgingMode}
            onChange={(v) => v && set({ judgingMode: v })}
          />
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>{mode?.hint}</Text>

        <SettingsGroup plain>
          {draft.judgingMode === 'MULTI' ? (
            <FieldRow
              label="Evaluations per team"
              value={draft.requiredEvaluations}
              onChangeText={(v) => set({ requiredEvaluations: v })}
              keyboardType="number-pad"
            />
          ) : null}
          <FieldRow label="Slot length (minutes)" value={draft.slotMinutes} onChangeText={(v) => set({ slotMinutes: v })} keyboardType="number-pad" />
          <FieldRow
            label="Time to turn up (minutes)"
            value={draft.callGraceMinutes}
            onChangeText={(v) => set({ callGraceMinutes: v })}
            keyboardType="number-pad"
          />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Judges mark during the slot. When it ends, marks are due before they can call the next team. A called team that
          doesn’t turn up in time can be marked a no-show.
        </Text>

        <SettingsGroup plain>
          <SwitchRow
            label="Advance or eliminate teams"
            hint="Off: every team goes on to the next round."
            value={draft.eliminationEnabled}
            onValueChange={(v) => set({ eliminationEnabled: v })}
          />
          <SwitchRow
            label="Counts toward the total"
            hint="Used when scores add up across rounds."
            value={draft.countsTowardTotal}
            onValueChange={(v) => set({ countsTowardTotal: v })}
          />
          <SwitchRow
            label="Stop new requests at a set time"
            value={!!draft.endAt}
            onValueChange={(on) => set({ endAt: on ? new Date(Date.now() + 3 * 3600_000).toISOString() : '' })}
          />
          {draft.endAt ? <DateTimeRow label="Last requests" value={new Date(draft.endAt)} onChange={(d) => set({ endAt: d.toISOString() })} /> : null}
        </SettingsGroup>
        {draft.endAt ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            After this, teams can’t join a queue. Teams already waiting are still evaluated; you close the round.
          </Text>
        ) : null}

        {round && round.teams.length ? (
          <SettingsGroup title={`Teams in this round · ${round.teams.length}`}>
            {round.teams.map((t) => (
              <SettingsRow
                key={t.id}
                icon={
                  t.standing === 'ADVANCED' ? (
                    <CheckCircle size={ICON} color={tokens.success} weight="fill" />
                  ) : t.standing === 'ELIMINATED' ? (
                    <XCircle size={ICON} color={tokens.danger} weight="fill" />
                  ) : (
                    <CircleDashed size={ICON} color={tokens.textMuted} />
                  )
                }
                label={`${t.teamCode ?? '—'}  ${t.name}`}
                value={
                  t.queueStatus
                    ? evalStatusLabel(t.queueStatus)
                    : t.required > 1
                      ? `${t.evaluations}/${t.required} evaluated`
                      : t.evaluations
                        ? 'Evaluated'
                        : 'Not evaluated'
                }
                onPress={round.eliminationEnabled ? () => decide(t) : undefined}
              />
            ))}
          </SettingsGroup>
        ) : null}
        {round && round.eliminationEnabled && round.teams.length ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>Tap a team to advance or eliminate it. Teams are told straight away.</Text>
        ) : null}

        {round && round.status !== 'ACTIVE' ? (
          <Button
            label="Delete round"
            variant="danger"
            size="lg"
            fullWidth
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? 'Add round' : 'Save round'} onPress={save} loading={saving} disabled={acting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
