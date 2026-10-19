import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinkSimple, LockOpen, WarningCircle } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../components/ui/CardSurface';
import { AppAlert } from '../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getResults, reopenJudgment, type HackathonResults } from '../lib/api/hackathon';
import { formatScore, formatWhen, standingLabel } from '../lib/hackathon';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * One team's results for the curator: per round its score, rank and decision,
 * and every judge's submitted marks per criterion with their notes. Locked
 * marks in an open round can be reopened for 5 minutes.
 */
export default function HackathonResultTeamScreen() {
  const { eventId, teamId, roundId } = useLocalSearchParams<{ eventId: string; teamId: string; roundId?: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<HackathonResults | null>(null);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonResultTeam');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getResults(eventId);
    if (res.ok) setData(res.data);
    else setError(res.message);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const team = data?.teams.find((t) => t.id === teamId);
  if (!data || !team) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title: 'Results' }} />
        {error || data ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>{error || 'This team isn’t on the hackathon any more.'}</Text>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const reopen = (judgmentId: string, judgeName: string) =>
    AppAlert.alert(`Reopen ${judgeName}’s marks?`, 'They get 5 more minutes to change them, and they’re notified. You never change marks yourself.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reopen',
        onPress: async () => {
          const res = await reopenJudgment(eventId!, judgmentId);
          if (!res.ok) return AppAlert.alert("Couldn't reopen", res.message);
          void load();
        },
      },
    ]);

  // The round the curator came from first, then the rest in order.
  const rounds = [...data.rounds].sort((a, b) => (a.id === roundId ? -1 : b.id === roundId ? 1 : a.order - b.order));

  return (
    <ScrollView style={{ backgroundColor: tokens.bg }} contentContainerStyle={[styles.content, { paddingTop: topSpacing }]} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: team.teamCode ?? 'Results' }} />
      <Text style={[styles.title, { color: tokens.text }]}>{team.name}</Text>
      <Text style={[styles.meta, { color: tokens.textSecondary }]}>
        {[
          team.rank != null ? `Rank ${team.rank}` : null,
          team.total != null ? `${data.scoringMode === 'CUMULATIVE' ? 'Total' : 'Score'} ${formatScore(team.total)}` : null,
          team.stage === 'CANCELLED' ? 'Cancelled' : team.stage === 'ELIMINATED' ? 'Eliminated' : null,
          ...team.awards.map((a) => (a.published ? a.title : `${a.title} (not published)`)),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {team.statement ? (
        <Text style={[styles.meta, { color: tokens.textMuted }]}>
          {[team.statement.code, team.statement.title].filter(Boolean).join(' · ')}
          {team.statement.themeLabel ? `  (${team.statement.themeLabel})` : ''}
        </Text>
      ) : null}
      {team.psChangedAfterEvalAt ? (
        <View style={styles.flag}>
          <WarningCircle size={18} color={tokens.warning} weight="fill" />
          <Text style={[styles.meta, { color: tokens.warning, marginTop: 0, flex: 1 }]}>
            Problem statement changed after evaluation ({formatWhen(team.psChangedAfterEvalAt)}). Marks were kept.
          </Text>
        </View>
      ) : null}

      {rounds.map((r) => {
        const p = team.rounds.find((x) => x.roundId === r.id)!;
        if (!p.takesPart && !p.evaluations.length) return null;
        const mentoring = r.kind === 'MENTORING';
        const title = [
          r.name,
          mentoring
            ? `${p.evaluations.length} mentor session${p.evaluations.length === 1 ? '' : 's'}`
            : p.score != null
              ? `${formatScore(p.score)} of ${formatScore(r.maxScore)}`
              : 'not evaluated',
          p.rank != null ? `#${p.rank}` : null,
          r.eliminationEnabled ? standingLabel(p.standing) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View key={r.id}>
            <Text style={[styles.section, { color: tokens.textMuted }]}>{title}</Text>
            {p.links.length ? (
              <SettingsGroup plain>
                {p.links.map((l) => (
                  <SettingsRow
                    key={l.url}
                    icon={<LinkSimple size={22} color={tokens.accent} weight="bold" />}
                    label={l.label}
                    external
                    onPress={() => void Linking.openURL(l.url)}
                  />
                ))}
              </SettingsGroup>
            ) : null}
            {p.linksNotes ? <Text style={[styles.note, { color: tokens.textMuted }]}>{p.linksNotes}</Text> : null}
            {p.evaluations.length === 0 ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>{mentoring ? 'No mentor feedback yet.' : 'No submitted marks yet.'}</Text>
            ) : null}
            {p.evaluations.map((ev) => (
              <View key={ev.judgmentId} style={styles.card}>
                <CardBackdrop shape={styles.card} />
                <View style={styles.cardHead}>
                  <Text style={[styles.judge, { color: tokens.text }]}>{ev.judgeName}</Text>
                  {!mentoring ? <Text style={[styles.judge, { color: tokens.accent }]}>{formatScore(ev.total)}</Text> : null}
                </View>
                {r.criteria.map((c) => {
                  const m = ev.marks.find((x) => x.metricId === c.id);
                  return (
                    <View key={c.id}>
                      <View style={styles.markRow}>
                        <Text style={[styles.markLabel, { color: tokens.textSecondary }]}>
                          {c.label}
                          {c.weight !== 1 ? ` ×${c.weight}` : ''}
                        </Text>
                        <Text style={[styles.markValue, { color: tokens.text }]}>
                          {m ? formatScore(m.value) : '–'} / {formatScore(c.maxValue)}
                        </Text>
                      </View>
                      {m?.comment ? <Text style={[styles.comment, { color: tokens.textMuted }]}>{m.comment}</Text> : null}
                    </View>
                  );
                })}
                {ev.review ? <Text style={[styles.review, { color: tokens.text }]}>{ev.review}</Text> : null}
                <Text style={[styles.comment, { color: tokens.textMuted }]}>
                  Submitted {formatWhen(ev.submittedAt)} · {ev.locked ? 'locked' : 'judge can still edit'}
                </Text>
                {ev.locked && r.status === 'ACTIVE' ? (
                  <SettingsGroup plain>
                    <SettingsRow
                      icon={<LockOpen size={22} color={tokens.text} />}
                      label="Reopen for 5 minutes"
                      onPress={() => reopen(ev.judgmentId, ev.judgeName)}
                    />
                  </SettingsGroup>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
      <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[6] }]}>
        Marks are never shown to teams. Notes are shared only if you turn on sharing judges’ notes.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize['2xl'], ...font('bold') },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font('medium') },
  flag: { flexDirection: 'row', gap: spacing[2], alignItems: 'center', marginTop: spacing[3] },
  section: { marginTop: spacing[8], marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...font('semibold') },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4], marginBottom: spacing[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[2] },
  judge: { fontSize: typography.fontSize.base, ...font('semibold') },
  markRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[1] },
  markLabel: { fontSize: typography.fontSize.sm, flex: 1, ...font() },
  markValue: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...font('semibold') },
  comment: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, marginBottom: spacing[1], ...font() },
  review: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
