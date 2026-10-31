import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CaretRight, CheckCircle, CircleDashed, Lock } from '@unifesto/unicon/react-native';
import {
  getMyAssignments,
  MyAssignments,
  AssignmentRound,
  RoundStatus,
} from '../lib/api/leaderboard';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos, type Cosmos } from '../theme/cosmos';
import { CardBackdrop } from '../components/ui/CardSurface';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import JudgeConsoleScreen from './JudgeConsoleScreen';

/** Colour + label for a round's lifecycle state, written as plain text. */
function roundBadge(status: RoundStatus, c: Cosmos): { label: string; color: string } {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Open for scoring', color: c.mint };
    case 'CLOSED':
      return { label: 'Closed', color: c.muted };
    default:
      return { label: 'Not started', color: c.warn };
  }
}

export default function JudgingEventScreen() {
  const router = useRouter();
  const c = useCosmos();
  const { eventId } = useLocalSearchParams<{ eventId: string; title?: string }>();

  const [data, setData] = useState<MyAssignments | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (eventId) setData(await getMyAssignments(eventId));
    setLoading(false);
    setRefreshing(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const isMentor = data?.kind === 'MENTOR';

  if (loading) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Hackathons run on a queue: the judge console replaces the team list.
  if (data?.isHackathon && eventId) return <JudgeConsoleScreen eventId={eventId} />;

  if (!data || data.rounds.length === 0) {
    return (
      <CosmosScreen contentContainerStyle={styles.content} refreshing={refreshing} onRefresh={onRefresh}>
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            Nothing to judge yet
          </Text>
          <Text style={[styles.emptyText, { color: c.muted }]}>
            {data
              ? 'The organiser hasn’t opened a round for you yet. Pull to refresh once judging begins.'
              : 'You’re no longer on the panel for this event.'}
          </Text>
        </View>
      </CosmosScreen>
    );
  }

  const renderRound = (round: AssignmentRound) => {
    const badge = roundBadge(round.status, c);
    const isClosed = round.status === 'CLOSED';
    const isActive = round.status === 'ACTIVE';

    return (
      <View key={round.id} style={styles.roundBlock}>
        <View style={styles.roundHeader}>
          <Text style={[styles.roundName, { color: c.text }]}>{round.name}</Text>
          <View style={styles.badge}>
            {isClosed ? <Lock size={12} color={badge.color} weight="fill" /> : <View style={[styles.dot, { backgroundColor: badge.color }]} />}
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <CardBackdrop shape={styles.card} />
          {isClosed ? (
            <View style={styles.lockedNote}>
              <Lock size={20} color={c.muted} weight="duotone" />
              <Text style={[styles.noteText, { color: c.soft }]}>
                This round is closed. Your scores are locked and can no longer be changed.
              </Text>
            </View>
          ) : round.entrants.length === 0 ? (
            <View style={styles.emptyNote}>
              <Text style={[styles.noteText, { color: c.soft }]}>
                No {data.title ? 'teams' : 'entrants'} assigned to you in this round.
              </Text>
            </View>
          ) : (
            round.entrants.map((entrant, idx) => (
              <Pressable
                key={entrant.id}
                style={({ pressed }) => [
                  styles.entrantRow,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                  pressed && { backgroundColor: c.tint },
                ]}
                disabled={!isActive}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isActive }}
                accessibilityLabel={`${entrant.name}, ${entrant.reviewed ? 'reviewed' : 'not reviewed'}`}
                onPress={() =>
                  router.push({
                    pathname: `/judging/${eventId}/${entrant.id}`,
                    params: {
                      roundId: round.id,
                      roundName: round.name,
                      entrantName: entrant.name,
                    },
                  })
                }
              >
                {entrant.reviewed ? (
                  <CheckCircle size={26} color={c.success} weight="fill" />
                ) : (
                  <CircleDashed size={26} color={c.muted} weight="regular" />
                )}
                <View style={styles.entrantText}>
                  <Text style={[styles.entrantName, { color: c.text }]}>{entrant.name}</Text>
                  <Text
                    style={[
                      styles.entrantStatus,
                      { color: entrant.reviewed ? c.success : c.muted },
                    ]}
                  >
                    {entrant.reviewed
                      ? isMentor
                        ? 'Review submitted'
                        : 'Scored & reviewed'
                      : isMentor
                        ? 'Not reviewed'
                        : 'Not scored'}
                  </Text>
                </View>
                {isActive && <CaretRight size={15} color={c.muted} />}
              </Pressable>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <CosmosScreen contentContainerStyle={styles.content} refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={[styles.intro, { color: c.soft }]}>
        {isMentor
          ? 'As a mentor you leave written feedback for each team. You don’t enter scores.'
          : 'Score each team against the criteria and leave an overall review. You only ever see your own marks.'}
      </Text>
      {data.rounds.map(renderRound)}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  intro: { fontSize: typography.fontSize.sm, lineHeight: 20, marginBottom: spacing[6], ...cosmosFont.body },
  roundBlock: { marginBottom: spacing[6] },
  roundHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], marginBottom: spacing[3] },
  roundName: { fontSize: 17, flex: 1, ...cosmosFont.strong },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  entrantRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[4], gap: spacing[3] },
  entrantText: { flex: 1 },
  entrantName: { fontSize: 16, ...cosmosFont.strong },
  entrantStatus: { fontSize: 13, marginTop: 2, ...cosmosFont.body },
  lockedNote: { paddingHorizontal: spacing[4], paddingVertical: spacing[5], flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  emptyNote: { paddingHorizontal: spacing[4], paddingVertical: spacing[5] },
  noteText: { fontSize: typography.fontSize.sm, lineHeight: 20, flex: 1, ...cosmosFont.body },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  emptyTitle: { fontSize: 22, lineHeight: 28, marginBottom: spacing[2], textAlign: 'center', ...cosmosFont.display },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
