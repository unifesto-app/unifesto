import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, CircleDashed, FileCsv, Trophy, WarningCircle, XCircle } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import ChipPicker from '../components/manage/ChipPicker';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import { GroupCell, SettingsGroup, SettingsGroupHeader, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useHackathonSocket from '../hooks/useHackathonSocket';
import {
  getResults,
  getResultsCsv,
  setRoundDecisions,
  updateHackathonConfig,
  type HackathonResults,
  type ResultRound,
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

  const roundId = data?.rounds.some((r) => r.id === view) ? view : null;
  const openTeam = useCallback(
    (teamId: string) =>
      router.push({ pathname: `/manage/event/${eventId}/hackathon/result`, params: { teamId, ...(roundId ? { roundId } : {}) } }),
    [router, eventId, roundId],
  );

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const round = data.rounds.find((r) => r.id === view) ?? null;

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
    // Teams already decided keep their decision; the server only decides the rest.
    const undecided = new Set(roundTeams.filter(({ p }) => p.standing === 'PENDING').map(({ t }) => t.id));
    const kept = roundTeams.length - undecided.size;
    split.advance = split.advance.filter((id) => undecided.has(id));
    split.eliminate = split.eliminate.filter((id) => undecided.has(id));
    const unscored = roundTeams.filter(({ t, p }) => p.score == null && undecided.has(t.id)).length;
    AppAlert.alert(
      `Advance ${split.advance.length} team${split.advance.length === 1 ? '' : 's'}?`,
      [
        `${split.advance.length} advance and ${split.eliminate.length} ${split.eliminate.length === 1 ? 'is' : 'are'} eliminated in ${round.name}.`,
        split.tiedAtCut ? `${split.tiedAtCut} more than ${n} because of a tie at the cut.` : '',
        unscored ? `${unscored} team${unscored === 1 ? ' wasn’t' : 's weren’t'} evaluated and ${unscored === 1 ? 'is' : 'are'} eliminated.` : '',
        kept ? `${kept} team${kept === 1 ? '' : 's'} you already decided keep${kept === 1 ? 's' : ''} ${kept === 1 ? 'its' : 'their'} decision.` : '',
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList<{ t: ResultTeam; p?: ResultRound }>
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
        data={round ? roundTeams : data.teams.map((t) => ({ t }))}
        keyExtractor={(item) => item.t.id}
        ListHeaderComponent={
          <>
            <ChipPicker
              options={[{ value: OVERALL, label: 'Overall' }, ...data.rounds.map((r) => ({ value: r.id, label: r.name }))]}
              value={view}
              onChange={(v) => v && setView(v)}
            />
            <SettingsGroupHeader
              title={
                !round
                  ? data.scoringMode === 'CUMULATIVE'
                    ? 'Ranking · rounds added up'
                    : `Ranking · ${data.rounds.find((r) => r.id === data.finalRoundId)?.name ?? 'final round'}`
                  : round.kind === 'MENTORING'
                    ? `${round.name} · mentoring`
                    : `${round.name} · out of ${formatScore(round.maxScore)}`
              }
            />
          </>
        }
        ListEmptyComponent={
          <GroupCell index={0} count={1}>
            <SettingsRow label={round ? 'No teams in this round' : 'No teams yet'} />
          </GroupCell>
        }
        renderItem={({ item, index }) => (
          <GroupCell index={index} count={round ? roundTeams.length : data.teams.length}>
            {round && item.p ? (
              <RoundRow t={item.t} p={item.p} round={round} onOpen={openTeam} />
            ) : (
              <OverallRow t={item.t} onOpen={openTeam} />
            )}
          </GroupCell>
        )}
        ListFooterComponent={
          <>
            {!round ? (
              <>
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
                {round.eliminationEnabled && roundTeams.length && round.status === 'CLOSED' ? (
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
          </>
        }
      />
    </KeyboardAvoidingView>
  );
}

const OverallRow = React.memo(function OverallRow({ t, onOpen }: { t: ResultTeam; onOpen: (teamId: string) => void }) {
  const tokens = useTokens();
  const won = t.awards.filter((a) => a.published).map((a) => a.title);
  return (
    <SettingsRow
      icon={
        t.awards.some((a) => a.published) ? (
          <Trophy size={ICON} color={tokens.accent} weight="fill" />
        ) : t.psChangedAfterEvalAt ? (
          <WarningCircle size={ICON} color={tokens.warning} weight="fill" />
        ) : t.stage === 'CANCELLED' || t.stage === 'ELIMINATED' ? (
          <XCircle size={ICON} color={tokens.textMuted} weight="fill" />
        ) : (
          <CheckCircle size={ICON} color={tokens.success} weight="fill" />
        )
      }
      label={`${t.rank != null ? `${t.rank}. ` : ''}${teamLabel(t)}`}
      value={t.stage === 'CANCELLED' ? 'Cancelled' : [t.total != null ? formatScore(t.total) : 'Not scored', ...won].join(' · ')}
      onPress={() => onOpen(t.id)}
    />
  );
});

const RoundRow = React.memo(function RoundRow({ t, p, round, onOpen }: {
  t: ResultTeam;
  p: ResultRound;
  round: HackathonResults['rounds'][number];
  onOpen: (teamId: string) => void;
}) {
  const tokens = useTokens();
  return (
    <SettingsRow
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
      value={
        round.kind === 'MENTORING'
          ? `${p.evaluations.length} session${p.evaluations.length === 1 ? '' : 's'}`
          : `${p.score != null ? formatScore(p.score) : 'Not evaluated'}${round.eliminationEnabled ? ` · ${standingLabel(p.standing)}` : ''}`
      }
      onPress={() => onOpen(t.id)}
    />
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
