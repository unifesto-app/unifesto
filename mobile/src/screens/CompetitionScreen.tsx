import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CheckCircle, CircleDashed, Quotes, Trophy, XCircle } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getParticipantView, type EntrantRoundStatus, type ParticipantView } from '../lib/api/leaderboard';
import { defaultBracketRound, journeyFor, sortBracket, standingOf, type Standing } from '../lib/competition';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 24;

const STATUS_LABEL: Record<EntrantRoundStatus, string> = {
  ADVANCED: 'Advanced',
  ELIMINATED: 'Out',
  PENDING: 'Awaiting results',
};

function headline(s: Standing): { title: string; body: string } {
  switch (s.kind) {
    case 'spectator':
      return { title: 'Following along', body: "You're not on a team in this competition. Here's how the rounds are going." };
    case 'waiting':
      return { title: 'Results pending', body: `Judges are still deciding ${s.round}.` };
    case 'in':
      return {
        title: s.next ? `Through to ${s.next}` : `Through ${s.round}`,
        body: s.next ? `You advanced from ${s.round}. ${s.next} hasn't started yet.` : `You advanced from ${s.round}.`,
      };
    case 'out':
      return { title: `Your run ended in ${s.round}`, body: 'Thanks for competing. Winners and feedback show up here.' };
  }
}

/**
 * The participant's side of a hackathon / competition board: where their team
 * stands, declared winners, the panel's written feedback once the organiser
 * reveals it, and the round-by-round bracket. No marks anywhere; the server
 * never sends them on this path.
 */
export default function CompetitionScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [view, setView] = useState<ParticipantView | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [round, setRound] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Competition');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getParticipantView(eventId);
    if (res.ok) {
      setView(res.data);
      setError('');
    } else {
      setError(res.message);
      setView((v) => (v === undefined ? null : v));
    }
  }, [eventId]);

  // A push opens this screen; refetch whenever it regains focus.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const myId = view?.myEntrantIds[0];
  const myName = useMemo(
    () => view?.rounds[0]?.entrants.find((e) => e.id === myId)?.name ?? null,
    [view, myId],
  );
  const steps = useMemo(() => (view && myId ? journeyFor(view, myId) : []), [view, myId]);
  const standing: Standing = myId ? standingOf(steps) : { kind: 'spectator' };
  const selectedRound = round || (view ? defaultBracketRound(view) : '');
  const bracket = view?.rounds.find((r) => r.id === selectedRound);
  const roundName = (id: string) => view?.rounds.find((r) => r.id === id)?.name ?? '';

  const statusIcon = (s: EntrantRoundStatus) =>
    s === 'ADVANCED' ? (
      <CheckCircle size={ICON} color={tokens.success} weight="fill" />
    ) : s === 'ELIMINATED' ? (
      <XCircle size={ICON} color={tokens.textMuted} weight="fill" />
    ) : (
      <CircleDashed size={ICON} color={tokens.textMuted} />
    );

  if (view === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const refreshControl = (
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
  );

  if (!view) {
    return (
      <ScrollView
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={[styles.center, { paddingTop: topSpacing + spacing[16] }]}
        contentInsetAdjustmentBehavior="never"
        refreshControl={refreshControl}
      >
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>No competition yet</Text>
        <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>
          {error || "The organiser hasn't opened the competition for this event. Pull to refresh later."}
        </Text>
      </ScrollView>
    );
  }

  const head = headline(standing);
  const headColor = standing.kind === 'in' ? tokens.success : tokens.text;

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <View style={styles.hero}>
        <CardBackdrop />
        {myName ? <Text style={[styles.team, { color: tokens.textMuted }]}>{myName}</Text> : null}
        <Text style={[styles.headTitle, { color: headColor }]}>{head.title}</Text>
        <Text style={[styles.headBody, { color: tokens.textSecondary }]}>{head.body}</Text>
      </View>

      {view.awards.length ? (
        <SettingsGroup title="Winners">
          {view.awards.map((a) => (
            <SettingsRow
              key={a.id}
              icon={<Trophy size={ICON} color={a.isMine ? tokens.accent : tokens.textMuted} weight="fill" />}
              label={a.title}
              value={`${[a.teamCode, a.entrantName ?? (a.isMine ? 'Your team' : '')].filter(Boolean).join(' ')}${a.isMine ? ' · You' : ''}`}
            />
          ))}
        </SettingsGroup>
      ) : null}
      {view.awards
        .filter((a) => a.notes)
        .map((a) => (
          <Text key={`note-${a.id}`} style={[styles.note, { color: tokens.textSecondary, marginTop: spacing[2] }]}>
            {a.title}: {a.notes}
          </Text>
        ))}

      {steps.length ? (
        <SettingsGroup title="My rounds">
          {steps.map((s) => (
            <SettingsRow
              key={s.roundId}
              icon={statusIcon(s.status)}
              label={s.name}
              value={s.status === 'PENDING' && s.roundStatus === 'PENDING' ? 'Not started' : STATUS_LABEL[s.status]}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {myId && view.revealReviews && view.feedback.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: tokens.textMuted }]}>Feedback from the panel</Text>
          {view.feedback
            .filter((f) => f.overallReview)
            .map((f, i) => (
              <View key={`${f.roundId}-${i}`} style={styles.quoteCard}>
                <CardBackdrop />
                <Quotes size={20} color={tokens.accent} weight="fill" />
                <Text style={[styles.quote, { color: tokens.text }]}>{f.overallReview}</Text>
                {view.rounds.length > 1 ? (
                  <Text style={[styles.quoteMeta, { color: tokens.textMuted }]}>{roundName(f.roundId)}</Text>
                ) : null}
              </View>
            ))}
        </View>
      ) : null}

      {view.rounds.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: tokens.textMuted }]}>Bracket</Text>
          {view.rounds.length > 1 ? (
            <View style={{ marginBottom: spacing[3] }}>
              <ChipPicker
                options={[...view.rounds].sort((a, b) => a.order - b.order).map((r) => ({ value: r.id, label: r.name }))}
                value={selectedRound}
                onChange={(v) => v && setRound(v)}
              />
            </View>
          ) : null}
          <SettingsGroup plain>
            {!bracket || bracket.entrants.length === 0 ? <SettingsRow label="No teams yet" /> : null}
            {bracket
              ? sortBracket(bracket.entrants).map((e) => (
                  <SettingsRow
                    key={e.id}
                    label={`${e.teamCode ? `${e.teamCode}  ` : ''}${e.name}${e.isMine ? ' (you)' : ''}`}
                    value={STATUS_LABEL[e.status]}
                  />
                ))
              : null}
          </SettingsGroup>
        </View>
      ) : null}

      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Scores stay private to the organisers. You'll get a notification when your team's status changes.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[16] },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  hero: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[5], marginTop: spacing[2] },
  team: { fontSize: typography.fontSize.sm, ...font('medium'), marginBottom: spacing[1] },
  headTitle: { fontSize: typography.fontSize['2xl'], ...font('heading'), letterSpacing: -0.4 },
  headBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...font() },
  section: { marginTop: spacing[8] },
  sectionTitle: { fontSize: typography.fontSize.sm, ...font('semibold'), marginBottom: spacing[3] },
  quoteCard: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[5], marginBottom: spacing[3], gap: spacing[2] },
  quote: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...font() },
  quoteMeta: { fontSize: typography.fontSize.sm, ...font('medium') },
  emptyTitle: { fontSize: typography.fontSize.xl, ...font('heading'), marginBottom: spacing[2] },
  muted: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...font() },
  note: { marginTop: spacing[6], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
