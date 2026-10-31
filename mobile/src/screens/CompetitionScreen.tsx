import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, CheckCircle, CircleDashed, Quotes, Trophy, XCircle } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../components/ui/CardSurface';
import ShadeCard from '../components/ui/ShadeCard';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { getParticipantView, type EntrantRoundStatus, type ParticipantView } from '../lib/api/leaderboard';
import { defaultBracketRound, journeyFor, sortBracket, standingOf, type Standing } from '../lib/competition';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

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
  const c = useCosmos();
  const [view, setView] = useState<ParticipantView | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [round, setRound] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
      <CheckCircle size={ICON} color={c.success} weight="fill" />
    ) : s === 'ELIMINATED' ? (
      <XCircle size={ICON} color={c.muted} weight="fill" />
    ) : (
      <CircleDashed size={ICON} color={c.muted} />
    );

  if (view === undefined) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!view) {
    return (
      <CosmosScreen contentContainerStyle={styles.content} refreshing={refreshing} onRefresh={onRefresh}>
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            No competition yet
          </Text>
          <Text style={[styles.muted, { color: c.muted, textAlign: 'center' }]}>
            {error || "The organiser hasn't opened the competition for this event. Pull to refresh later."}
          </Text>
        </View>
      </CosmosScreen>
    );
  }

  const head = headline(standing);

  return (
    <CosmosScreen contentContainerStyle={styles.content} refreshing={refreshing} onRefresh={onRefresh}>
      {/* Where my team stands: the screen's hero, on the hackathon's blue shade. */}
      <ShadeCard tone="blue" style={styles.hero}>
        {myName ? <Text style={[styles.team, { color: c.soft }]}>{myName}</Text> : null}
        <View style={styles.headRow}>
          {standing.kind === 'in' ? <Check size={22} color={c.text} weight="bold" /> : null}
          <Text style={[styles.headTitle, { color: c.text }]} accessibilityRole="header">
            {head.title}
          </Text>
        </View>
        <Text style={[styles.headBody, { color: c.soft }]}>{head.body}</Text>
      </ShadeCard>

      {view.awards.length ? (
        <SettingsGroup title="Winners">
          {view.awards.map((a) => (
            <SettingsRow
              key={a.id}
              icon={<Trophy size={ICON} color={c.ivory} weight="fill" />}
              label={a.title}
              value={`${[a.teamCode, a.entrantName ?? (a.isMine ? 'My team' : '')].filter(Boolean).join(' ')}${a.isMine ? ' · You' : ''}`}
            />
          ))}
        </SettingsGroup>
      ) : null}
      {view.awards
        .filter((a) => a.notes)
        .map((a) => (
          <Text key={`note-${a.id}`} style={[styles.note, { color: c.soft, marginTop: spacing[2] }]}>
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
          <Text style={[styles.sectionTitle, { color: c.muted }]}>Feedback from the panel</Text>
          {view.feedback
            .filter((f) => f.overallReview)
            .map((f, i) => (
              <View key={`${f.roundId}-${i}`} style={styles.quoteCard}>
                <CardBackdrop shape={styles.quoteCard} />
                <Quotes size={20} color={c.muted} weight="fill" />
                <Text style={[styles.quote, { color: c.text }]}>{f.overallReview}</Text>
                {view.rounds.length > 1 ? (
                  <Text style={[styles.quoteMeta, { color: c.muted }]}>{roundName(f.roundId)}</Text>
                ) : null}
              </View>
            ))}
        </View>
      ) : null}

      {view.rounds.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.muted }]}>Bracket</Text>
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
                  // My team is marked by weight, never colour.
                  <View
                    key={e.id}
                    style={styles.entrantRow}
                    accessible
                    accessibilityLabel={`${[e.teamCode, e.name].filter(Boolean).join(' ')}${e.isMine ? ', you' : ''}, ${STATUS_LABEL[e.status]}`}
                  >
                    {e.teamCode ? <Text style={[styles.code, { color: c.muted }]}>{e.teamCode}</Text> : null}
                    <Text style={[styles.entrant, e.isMine && cosmosFont.strong, { color: c.text }]} numberOfLines={1}>
                      {e.name}
                      {e.isMine ? ' (you)' : ''}
                    </Text>
                    <View style={styles.status}>
                      {e.status === 'ADVANCED' ? <Check size={13} color={c.success} weight="bold" /> : null}
                      <Text style={[styles.statusText, { color: e.status === 'ADVANCED' ? c.success : c.muted }]}>
                        {STATUS_LABEL[e.status]}
                      </Text>
                    </View>
                  </View>
                ))
              : null}
          </SettingsGroup>
        </View>
      ) : null}

      <Text style={[styles.note, { color: c.muted }]}>
        Scores stay private to the organisers. You'll get a notification when your team's status changes.
      </Text>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  hero: { marginTop: spacing[2] },
  team: { fontSize: typography.fontSize.sm, ...cosmosFont.strong, marginBottom: spacing[2] },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  headTitle: { flexShrink: 1, fontSize: 24, lineHeight: 30, ...cosmosFont.display, letterSpacing: displayTracking(24) },
  headBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  section: { marginTop: spacing[8] },
  sectionTitle: { fontSize: typography.fontSize.sm, ...cosmosFont.strong, marginBottom: spacing[3] },
  quoteCard: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[5], marginBottom: spacing[3], gap: spacing[2] },
  quote: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...cosmosFont.body },
  quoteMeta: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  emptyTitle: { fontSize: 22, lineHeight: 28, textAlign: 'center', ...cosmosFont.display, marginBottom: spacing[2] },
  entrantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 52, paddingVertical: spacing[2] },
  code: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  entrant: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  muted: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  note: { marginTop: spacing[6], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
