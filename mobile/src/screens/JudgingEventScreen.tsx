import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CaretRight, CheckCircle, CircleDashed, Lock } from '@unifesto/unicon/react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getMyAssignments,
  MyAssignments,
  AssignmentRound,
  RoundStatus,
} from '../lib/api/leaderboard';
import { spacing, borderRadius, font } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import useTopSpacing from '../hooks/useTopSpacing';
import { CardBackdrop } from '../components/ui/CardSurface';
import JudgeConsoleScreen from './JudgeConsoleScreen';

/** Colour + label for a round's lifecycle state. */
function roundBadge(status: RoundStatus, colors: any): { label: string; color: string } {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Open for scoring', color: colors.success };
    case 'CLOSED':
      return { label: 'Closed', color: colors.textMuted };
    default:
      return { label: 'Not started', color: colors.warning };
  }
}

export default function JudgingEventScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const topSpacing = useTopSpacing();
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

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing[6], paddingBottom: spacing[8] },
    intro: {
      fontSize: 14,
      fontFamily: getFontFamily('normal'),
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: spacing[6],
    },
    roundBlock: { marginBottom: spacing[6] },
    roundHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing[3],
    },
    roundName: {
      fontSize: 18,
      ...font('heading'),
      color: colors.text,
      letterSpacing: -0.3,
      flex: 1,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[1],
      paddingHorizontal: spacing[3],
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      backgroundColor: colors.backgroundSecondary,
    },
    badgeText: { fontSize: 11, fontFamily: getFontFamily('bold'), letterSpacing: 0.4 },
    card: {
      borderRadius: borderRadius['2xl'],
      overflow: 'hidden',
    },
    entrantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[4],
      gap: spacing[3],
    },
    entrantRowDivider: { borderTopWidth: 1, borderTopColor: colors.borderMuted },
    entrantText: { flex: 1 },
    entrantName: {
      fontSize: 16,
      fontFamily: getFontFamily('semibold'),
      color: colors.text,
      letterSpacing: -0.2,
    },
    entrantStatus: {
      fontSize: 13,
      fontFamily: getFontFamily('medium'),
      marginTop: 2,
    },
    lockedNote: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[5],
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
    },
    emptyNote: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[5],
    },
    noteText: {
      fontSize: 14,
      fontFamily: getFontFamily('normal'),
      color: colors.textMuted,
      lineHeight: 20,
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: topSpacing + 100,
      paddingHorizontal: spacing[6],
    },
    emptyTitle: {
      fontSize: 20,
      ...font('heading'),
      color: colors.text,
      marginBottom: spacing[2],
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 15,
      fontFamily: getFontFamily('normal'),
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      tintColor={colors.primary}
    />
  );

  // Hackathons run on a queue: the judge console replaces the team list.
  if (data?.isHackathon && eventId) return <JudgeConsoleScreen eventId={eventId} />;

  if (!data || data.rounds.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.center}
        refreshControl={refreshControl}
      >
        <Text style={styles.emptyTitle}>Nothing to judge yet</Text>
        <Text style={styles.emptyText}>
          {data
            ? 'The organiser hasn’t opened a round for you yet. Pull to refresh once judging begins.'
            : 'You’re no longer on the panel for this event.'}
        </Text>
      </ScrollView>
    );
  }

  const renderRound = (round: AssignmentRound) => {
    const badge = roundBadge(round.status, colors);
    const isClosed = round.status === 'CLOSED';
    const isActive = round.status === 'ACTIVE';

    return (
      <View key={round.id} style={styles.roundBlock}>
        <View style={styles.roundHeader}>
          <Text style={styles.roundName}>{round.name}</Text>
          <View style={styles.badge}>
            {isClosed && <Lock size={12} color={badge.color} weight="fill" />}
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <CardBackdrop shape={styles.card} />
          {isClosed ? (
            <View style={styles.lockedNote}>
              <Lock size={20} color={colors.textMuted} weight="duotone" />
              <Text style={styles.noteText}>
                This round is closed. Your scores are locked and can no longer be changed.
              </Text>
            </View>
          ) : round.entrants.length === 0 ? (
            <View style={styles.emptyNote}>
              <Text style={styles.noteText}>
                No {data.title ? 'teams' : 'entrants'} assigned to you in this round.
              </Text>
            </View>
          ) : (
            round.entrants.map((entrant, idx) => (
              <TouchableOpacity
                key={entrant.id}
                style={[styles.entrantRow, idx > 0 && styles.entrantRowDivider]}
                activeOpacity={isActive ? 0.7 : 1}
                disabled={!isActive}
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
                  <CheckCircle size={26} color={colors.success} weight="fill" />
                ) : (
                  <CircleDashed size={26} color={colors.textMuted} weight="regular" />
                )}
                <View style={styles.entrantText}>
                  <Text style={styles.entrantName}>{entrant.name}</Text>
                  <Text
                    style={[
                      styles.entrantStatus,
                      { color: entrant.reviewed ? colors.success : colors.textMuted },
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
                {isActive && <CaretRight size={18} color={colors.textMuted} weight="bold" />}
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing + spacing[2] }]}
      contentInsetAdjustmentBehavior="never"
      refreshControl={refreshControl}
    >
      <Text style={styles.intro}>
        {isMentor
          ? 'As a mentor you leave written feedback for each team. You don’t enter scores.'
          : 'Score each team against the criteria and leave an overall review. You only ever see your own marks.'}
      </Text>
      {data.rounds.map(renderRound)}
    </ScrollView>
  );
}
