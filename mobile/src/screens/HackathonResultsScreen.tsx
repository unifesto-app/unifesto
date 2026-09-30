import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, CircleDashed, FileCsv, Trophy, WarningCircle, XCircle } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import ChipPicker from '../components/manage/ChipPicker';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useHackathonSocket from '../hooks/useHackathonSocket';
import {
  getResults,
  getResultsCsv,
  setRoundDecisions,
  updateHackathonConfig,
  type HackathonResults,
  type ResultTeam,
  type ScoringMode,
} from '../lib/api/hackathon';
import { SCORING_MODE_OPTIONS, formatScore, standingLabel, topNSplit } from '../lib/hackathon';
import { shareCsvText } from '../lib/csvShare';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;
const OVERALL = '__overall__';

const teamLabel = (t: ResultTeam) => `${t.teamCode ?? '—'}  ${t.name}`;

/**
 * The curator's results (plan §9): the ranking overall and per round, from
 * submitted evaluations only. Rankings are a guide; advancing stays the
 * curator's call, with a "top N" helper. Also: how the winner is decided,
 * sharing judges' notes with teams, and the results CSV.
 */
export default function HackathonResultsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<HackathonResults | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState(OVERALL);
  const [topN, setTopN] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('HackathonResults');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getResults(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHackathonSocket(eventId, () => void load());

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const round = data.rounds.find((r) => r.id === view) ?? null;
  const openTeam = (teamId: string) =>
    router.push({ pathname: `/manage/event/${eventId}/hackathon/result`, params: { teamId, ...(round ? { roundId: round.id } : {}) } });

  const setMode = async (mode: ScoringMode) => {
    if (mode === data.scoringMode) return;
    setBusy(true);
    const res = await updateHackathonConfig(eventId!, { scoringMode: mode });
    setBusy(false);
    if (!res.ok) return AppAlert.alert("Couldn't change it", res.message);
    void load();
  };

  const setReveal = (on: boolean) => {
    const save = async () => {
      setBusy(true);
      const res = await updateHackathonConfig(eventId!, { revealReviews: on });
      setBusy(false);
      if (!res.ok) return AppAlert.alert("Couldn't change it", res.message);
      void load();
    };
    if (!on) return void save();
    AppAlert.alert(
      'Share judges’ notes with teams?',
      'Each team sees the written notes about its own team, without judges’ names. Marks stay hidden. Teams with notes are notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share notes', onPress: () => void save() },
      ],
    );
  };

  const exportCsv = async () => {
    setBusy(true);
    const res = await getResultsCsv(eventId!);
    if (!res.ok) {
      setBusy(false);
      return AppAlert.alert("Couldn't export", res.message);
    }
    const shared = await shareCsvText('hackathon-results.csv', res.data).catch(() => false);
    setBusy(false);
    if (!shared) AppAlert.alert("Couldn't share", 'Sharing isn’t available on this device.');
  };

  // Round view: teams in the round, best score first.
  const roundTeams = round
    ? data.teams
        .filter((t) => t.stage !== 'CANCELLED' && t.rounds.find((p) => p.roundId === round.id)?.takesPart)
        .map((t) => ({ t, p: t.rounds.find((p) => p.roundId === round.id)! }))
        .sort((a, b) => (a.p.rank ?? Number.MAX_SAFE_INTEGER) - (b.p.rank ?? Number.MAX_SAFE_INTEGER))
    : [];

  const applyTopN = () => {
    if (!round) return;
    const n = Number(topN);
    if (!Number.isInteger(n) || n < 1) return AppAlert.alert('How many?', 'Enter how many teams go through, like 10.');
    const split = topNSplit(roundTeams.map(({ t, p }) => ({ id: t.id, score: p.score })), n);
    const unscored = roundTeams.filter(({ p }) => p.score == null).length;
    AppAlert.alert(
      `Advance ${split.advance.length} team${split.advance.length === 1 ? '' : 's'}?`,
      [
        `${split.advance.length} advance and ${split.eliminate.length} ${split.eliminate.length === 1 ? 'is' : 'are'} eliminated in ${round.name}.`,
        split.tiedAtCut ? `${split.tiedAtCut} more than ${n} because of a tie at the cut.` : '',
        unscored ? `${unscored} team${unscored === 1 ? ' wasn’t' : 's weren’t'} evaluated and ${unscored === 1 ? 'is' : 'are'} eliminated.` : '',
        'Every team is told. You can still change any team afterwards.',
      ]
        .filter(Boolean)
        .join(' '),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const res = await setRoundDecisions(eventId!, round.id, [
              ...split.advance.map((id) => ({ entrantId: id, status: 'ADVANCED' as const })),
              ...split.eliminate.map((id) => ({ entrantId: id, status: 'ELIMINATED' as const })),
            ]);
            setBusy(false);
            if (!res.ok) return AppAlert.alert("Couldn't save", res.message);
            setTopN('');
            void load();
          },
        },
      ],
    );
  };

  const overallValue = (t: ResultTeam) => {
    const won = t.awards.filter((a) => a.published).map((a) => a.title);
    return [t.total != null ? formatScore(t.total) : 'Not scored', ...won].join(' · ');
  };
  const overallIcon = (t: ResultTeam) =>
    t.awards.some((a) => a.published) ? (
      <Trophy size={ICON} color={tokens.accent} weight="fill" />
    ) : t.psChangedAfterEvalAt ? (
      <WarningCircle size={ICON} color={tokens.warning} weight="fill" />
    ) : t.stage === 'CANCELLED' || t.stage === 'ELIMINATED' ? (
      <XCircle size={ICON} color={tokens.textMuted} weight="fill" />
    ) : (
      <CheckCircle size={ICON} color={tokens.success} weight="fill" />
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      >
        <ChipPicker
          options={[{ value: OVERALL, label: 'Overall' }, ...data.rounds.map((r) => ({ value: r.id, label: r.name }))]}
          value={view}
          onChange={(v) => v && setView(v)}
        />

        {!round ? (
          <>
            <SettingsGroup title={data.scoringMode === 'CUMULATIVE' ? 'Ranking · rounds added up' : `Ranking · ${data.rounds.find((r) => r.id === data.finalRoundId)?.name ?? 'final round'}`}>
              {data.teams.length === 0 ? <SettingsRow label="No teams yet" /> : null}
              {data.teams.map((t) => (
                <SettingsRow
                  key={t.id}
                  icon={overallIcon(t)}
                  label={`${t.rank != null ? `${t.rank}. ` : ''}${teamLabel(t)}`}
                  value={t.stage === 'CANCELLED' ? 'Cancelled' : overallValue(t)}
                  onPress={() => openTeam(t.id)}
                />
              ))}
            </SettingsGroup>
            {data.teams.some((t) => t.psChangedAfterEvalAt) ? (
              <Text style={[styles.note, { color: tokens.warning }]}>
                Teams with a warning sign had their problem statement changed after they were evaluated. Their marks are kept.
              </Text>
            ) : null}
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Only submitted marks count. Rankings are a guide: you decide who advances and who wins.
            </Text>

            <View style={{ marginTop: spacing[8] }}>
              <BlockTitle>How the winner is decided</BlockTitle>
              <ChipPicker
                options={SCORING_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={data.scoringMode}
                onChange={(v) => v && !busy && void setMode(v)}
              />
            </View>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {SCORING_MODE_OPTIONS.find((o) => o.value === data.scoringMode)?.hint} Choose which rounds count on each round’s screen.
            </Text>

            <SettingsGroup plain>
              <SwitchRow
                label="Share judges’ notes with teams"
                hint="Each team sees notes about its own team, without judges’ names. Never marks."
                value={data.revealReviews}
                disabled={busy}
                onValueChange={setReveal}
              />
            </SettingsGroup>
          </>
        ) : (
          <>
            <SettingsGroup title={`${round.name} · out of ${formatScore(round.maxScore)}`}>
              {roundTeams.length === 0 ? <SettingsRow label="No teams in this round" /> : null}
              {roundTeams.map(({ t, p }) => (
                <SettingsRow
                  key={t.id}
                  icon={
                    p.standing === 'ADVANCED' ? (
                      <CheckCircle size={ICON} color={tokens.success} weight="fill" />
                    ) : p.standing === 'ELIMINATED' ? (
                      <XCircle size={ICON} color={tokens.danger} weight="fill" />
                    ) : (
                      <CircleDashed size={ICON} color={tokens.textMuted} />
                    )
                  }
                  label={`${p.rank != null ? `${p.rank}. ` : ''}${teamLabel(t)}`}
                  value={`${p.score != null ? formatScore(p.score) : 'Not evaluated'}${round.eliminationEnabled ? ` · ${standingLabel(p.standing)}` : ''}`}
                  onPress={() => openTeam(t.id)}
                />
              ))}
            </SettingsGroup>
            {round.eliminationEnabled && roundTeams.length && round.status !== 'PENDING' ? (
              <>
                <SettingsGroup title="Advance the top teams" plain>
                  <FieldRow label="How many go through" value={topN} onChangeText={setTopN} keyboardType="number-pad" placeholder="10" />
                </SettingsGroup>
                <Button
                  label="Advance top teams, eliminate the rest"
                  variant="secondary"
                  fullWidth
                  loading={busy}
                  disabled={!topN}
                  onPress={applyTopN}
                  style={{ marginTop: spacing[3] }}
                />
                <Text style={[styles.note, { color: tokens.textMuted }]}>
                  Teams tied at the cut all go through. Change any single team from the round’s screen.
                </Text>
              </>
            ) : null}
            {!round.eliminationEnabled ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>This round doesn’t eliminate: every team goes on.</Text>
            ) : null}
          </>
        )}

        <Button
          label="Export results (CSV)"
          variant="secondary"
          size="lg"
          fullWidth
          loading={busy}
          icon={<FileCsv size={18} color={tokens.text} weight="fill" />}
          onPress={() => void exportCsv()}
          style={{ marginTop: spacing[8] }}
        />
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Every team, each judge’s marks per criterion, round scores, decisions, totals and awards.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
