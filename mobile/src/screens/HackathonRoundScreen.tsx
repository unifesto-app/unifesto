import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CheckCircle, CircleDashed, PencilSimple, Pause, Play, Stop, XCircle } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { Button } from '../components/ui';
import { GUTTER } from '../components/home/Section';
import useHackathonSocket from '../hooks/useHackathonSocket';
import { openSpaceWeb } from '../lib/openOnWeb';
import { getRound, setRoundStatus, setTeamDecision, type RoundDetail, type RoundStatus, type Standing } from '../lib/api/hackathon';
import { evalStatusLabel, roundStatusLabel, standingLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

/**
 * One round on the day: opening, pausing and closing it, and advancing or
 * eliminating its teams. How it's judged and its criteria are set up on
 * Unifesto Space (D3). Marks aren't shown here.
 */
export default function HackathonRoundScreen() {
  const { eventId, roundId, spaceId } = useLocalSearchParams<{ eventId: string; roundId: string; spaceId?: string }>();
  const c = useCosmos();
  const [round, setRound] = useState<RoundDetail | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!eventId || !roundId) return;
    const res = await getRound(eventId, roundId);
    if (!res.ok) return setError(res.message);
    setRound(res.data);
  }, [eventId, roundId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHackathonSocket(eventId, () => void load());

  const title = round?.name ?? 'Round';

  if (!round) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title }} />
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

  const changeStatus = (to: RoundStatus) => {
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
          setRound(res.data);
        },
      },
    ]);
  };

  const decide = (team: RoundDetail['teams'][number]) => {
    const setTo = async (status: Standing) => {
      const res = await setTeamDecision(eventId!, roundId!, team.id, status);
      if (!res.ok) return AppAlert.alert("Couldn't save", res.message);
      setRound(res.data);
    };
    AppAlert.alert(
      [team.teamCode, team.name].filter(Boolean).join(' · '),
      `${standingLabel(team.standing)} in ${round.name}. ${team.evaluations}/${team.required} evaluation${team.required === 1 ? '' : 's'}.`,
      [
        { text: 'Advance', onPress: () => void setTo('ADVANCED') },
        { text: 'Eliminate', style: 'destructive', onPress: () => void setTo('ELIMINATED') },
        ...(team.standing !== 'PENDING' ? [{ text: 'Undecided', onPress: () => void setTo('PENDING') }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const icon = (I: typeof Play, color = c.text) => <I size={ICON} color={color} />;

  return (
    <CosmosScreen contentContainerStyle={styles.content} bottom={80}>
      <Stack.Screen options={{ title }} />
      <SettingsGroup title={`Status · ${roundStatusLabel(round.status)}`}>
        {round.status !== 'ACTIVE' ? (
          <SettingsRow
            icon={icon(Play, c.success)}
            label={round.status === 'CLOSED' ? 'Open again' : 'Open round'}
            value={round.blockers.length ? 'Waiting on decisions' : undefined}
            onPress={acting ? undefined : () => changeStatus('ACTIVE')}
          />
        ) : (
          <>
            <SettingsRow icon={icon(Pause, c.warn)} label="Pause" onPress={acting ? undefined : () => changeStatus('PENDING')} />
            <SettingsRow icon={icon(Stop, c.danger)} label="Close round" danger onPress={acting ? undefined : () => changeStatus('CLOSED')} />
          </>
        )}
      </SettingsGroup>
      {round.blockers.map((b) => (
        <Text key={b.roundId} style={[styles.note, { color: c.warn }]}>
          Decide every team in {b.roundName} first: {b.teams.slice(0, 6).map((t) => t.teamCode ?? t.name).join(', ')}
          {b.teams.length > 6 ? ` and ${b.teams.length - 6} more` : ''}.
        </Text>
      ))}
      {round.kind === 'EVALUATION' && round.status !== 'ACTIVE' && !round.criteria.length ? (
        <Text style={[styles.note, { color: c.warn }]}>Add at least one criterion before opening.</Text>
      ) : null}
      <Text style={[styles.note, { color: c.muted }]}>
        {round.kind === 'MENTORING'
          ? `${round.judges} mentor${round.judges === 1 ? '' : 's'} mentor this round.`
          : round.judgingMode === 'PANEL'
            ? `${round.panels} panel${round.panels === 1 ? '' : 's'} can take this round.`
            : `${round.judges} judge${round.judges === 1 ? '' : 's'} judge this round.`}
        {round.openRequests ? ` ${round.openRequests} in queues now.` : ''}
      </Text>

      {round.kind === 'EVALUATION' ? (
        <>
          <SettingsGroup title="Criteria">
            {round.criteria.map((crit) => (
              <SettingsRow
                key={crit.id}
                label={crit.label}
                value={`out of ${crit.maxValue}${crit.weight !== 1 ? ` · ×${crit.weight}` : ''}${crit.allRounds ? ' · all rounds' : ''}`}
              />
            ))}
          </SettingsGroup>
          {round.criteriaLocked ? (
            <Text style={[styles.note, { color: c.muted }]}>Marks are in, so criteria, top marks and weights are locked.</Text>
          ) : null}
        </>
      ) : null}
      <SettingsGroup>
        <SettingsRow
          icon={icon(PencilSimple)}
          label="Edit round and criteria"
          external
          onPress={() => openSpaceWeb(`/dashboard/events/${eventId}/hackathon/rounds`, spaceId)}
        />
      </SettingsGroup>

      {round.teams.length ? (
        <SettingsGroup title={`Teams in this round · ${round.teams.length}`}>
          {round.teams.map((t) => (
            <SettingsRow
              key={t.id}
              icon={
                t.standing === 'ADVANCED' ? (
                  <CheckCircle size={ICON} color={c.success} weight="fill" />
                ) : t.standing === 'ELIMINATED' ? (
                  <XCircle size={ICON} color={c.danger} weight="fill" />
                ) : (
                  <CircleDashed size={ICON} color={c.muted} />
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
      {round.eliminationEnabled && round.teams.length ? (
        <Text style={[styles.note, { color: c.muted }]}>Tap a team to advance or eliminate it. Teams are told straight away.</Text>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
