import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, CircleDashed, PlayCircle, Plus } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getRounds, type RoundRow } from '../lib/api/hackathon';
import { JUDGING_MODE_OPTIONS, roundStatusLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;

/** One line of progress for a round: open rounds show evaluations and the queue, closed ones decisions. */
function roundSummary(r: RoundRow): string {
  const mode = r.kind === 'MENTORING' ? 'Mentoring' : JUDGING_MODE_OPTIONS.find((o) => o.value === r.judgingMode)?.label ?? '';
  if (r.status === 'ACTIVE') return `${roundStatusLabel(r.status)} · ${r.evaluated}/${r.teams} evaluated${r.inQueue ? ` · ${r.inQueue} in queue` : ''}`;
  if (r.status === 'CLOSED') return r.undecided ? `Closed · ${r.undecided} undecided` : 'Closed';
  if (r.kind === 'MENTORING') return `${mode} · ${r.requiredEvaluations} session${r.requiredEvaluations === 1 ? '' : 's'} per team`;
  return `${mode} · ${r.criteria ? `${r.criteria} criteria` : 'no criteria yet'}`;
}

/** The hackathon's rounds in order: status and progress, and a way to add one. */
export default function HackathonRoundsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('HackathonRounds');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getRounds(eventId);
    if (res.ok) {
      setRounds(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!rounds) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const open = (id: string) => router.push({ pathname: `/manage/event/${eventId}/hackathon/round`, params: { roundId: id } });

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
      <SettingsGroup>
        {rounds.map((r) => (
          <SettingsRow
            key={r.id}
            icon={
              r.status === 'ACTIVE' ? (
                <PlayCircle size={ICON} color={tokens.success} weight="fill" />
              ) : r.status === 'CLOSED' ? (
                <CheckCircle size={ICON} color={tokens.textMuted} weight="fill" />
              ) : (
                <CircleDashed size={ICON} color={tokens.accent} weight="bold" />
              )
            }
            label={r.name}
            value={roundSummary(r)}
            onPress={() => open(r.id)}
          />
        ))}
      </SettingsGroup>
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        Open a round to let teams join judges’ queues. A round that eliminates needs every team advanced or eliminated before
        the next round can open.
      </Text>
      <Button
        label="Add a round"
        variant="secondary"
        size="lg"
        fullWidth
        icon={<Plus size={18} color={tokens.text} weight="bold" />}
        onPress={() => open('new')}
        style={{ marginTop: spacing[6] }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
