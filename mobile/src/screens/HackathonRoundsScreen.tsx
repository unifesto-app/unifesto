import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, CircleDashed, PlayCircle, Plus } from '@unifesto/unicon/react-native';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { openSpaceWeb } from '../lib/openOnWeb';
import { getRounds, type RoundRow } from '../lib/api/hackathon';
import { JUDGING_MODE_OPTIONS, roundStatusLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
  const { eventId, spaceId } = useLocalSearchParams<{ eventId: string; spaceId?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={[styles.empty, { backgroundColor: c.raised }]}>
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const open = (id: string) => router.push({ pathname: `/manage/event/${eventId}/hackathon/round`, params: { roundId: id, spaceId } });

  return (
    <CosmosScreen
      contentContainerStyle={styles.content}
      bottom={100}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <SettingsGroup>
        {rounds.map((r) => (
          <SettingsRow
            key={r.id}
            icon={
              r.status === 'ACTIVE' ? (
                <PlayCircle size={ICON} color={c.success} weight="fill" />
              ) : r.status === 'CLOSED' ? (
                <CheckCircle size={ICON} color={c.muted} weight="fill" />
              ) : (
                <CircleDashed size={ICON} color={c.primary} weight="bold" />
              )
            }
            label={r.name}
            value={roundSummary(r)}
            onPress={() => open(r.id)}
          />
        ))}
      </SettingsGroup>
      <Text style={[styles.note, { color: c.muted }]}>
        Open a round to let teams join judges’ queues. A round that eliminates needs every team advanced or eliminated before
        the next round can open.
      </Text>
      <Button
        label="Add a round on the web"
        variant="secondary"
        size="lg"
        fullWidth
        icon={<Plus size={18} color={c.text} weight="bold" />}
        onPress={() => openSpaceWeb(`/events/${eventId}/hackathon/rounds`, spaceId)}
        style={{ marginTop: spacing[6] }}
      />
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
