import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CheckCircle, Coffee, Gavel, MapPin, UsersThree, VideoCamera } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SlotTimer from '../components/hackathon/SlotTimer';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useHackathonSocket from '../hooks/useHackathonSocket';
import {
  getEvaluators,
  getMyEvaluation,
  leaveQueue,
  requestEvaluation,
  type Evaluator,
  type MyEvaluation,
  type TeamRound,
} from '../lib/api/hackathon';
import { evalStatusLabel, roundBlockedCopy, stageCopy, teamRequestCopy, waitLabel } from '../lib/hackathon';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;

/**
 * The team's judging screen: pick a judge (or panel) in an open round and
 * join their queue, watch your place in line, and get called ("You're up",
 * with the room or a call link). Live over the socket; no marks, ever.
 */
export default function HackathonEvaluateScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<MyEvaluation | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [picking, setPicking] = useState<{ round: TeamRound; list: Evaluator[] | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useAnalyticsScreenTracking('HackathonEvaluate');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getMyEvaluation(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else {
      setError(res.message);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHackathonSocket(eventId, () => void load());

  const openPicker = async (round: TeamRound) => {
    setPicking({ round, list: null });
    const res = await getEvaluators(eventId!, round.id);
    if (!res.ok) {
      setPicking(null);
      return AppAlert.alert("Couldn't load judges", res.message);
    }
    setPicking({ round, list: res.data.evaluators });
  };

  const join = (round: TeamRound, e: Evaluator) =>
    AppAlert.alert(
      `Join ${e.name}’s queue?`,
      `${e.waiting ? `${e.waiting} team${e.waiting === 1 ? '' : 's'} ahead. ` : ''}We’ll notify your team when you’re next and when you’re called.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join queue',
          onPress: async () => {
            setBusy(true);
            const res = await requestEvaluation(eventId!, round.id, e.kind === 'PANEL' ? { panelId: e.id } : { judgeUserId: e.id });
            setBusy(false);
            if (!res.ok) return AppAlert.alert("Couldn't join", res.message);
            setPicking(null);
            setData(res.data);
          },
        },
      ],
    );

  const leave = (requestId: string) =>
    AppAlert.alert('Leave the queue?', 'You lose your place. You can join a queue again afterwards.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const res = await leaveQueue(eventId!, requestId);
          setBusy(false);
          if (!res.ok) return AppAlert.alert("Couldn't leave", res.message);
          setData(res.data);
        },
      },
    ]);

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.body, { color: tokens.textSecondary, textAlign: 'center' }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const req = data.openRequest;
  const icon = (I: typeof Gavel) => <I size={ICON} color={tokens.text} />;
  const notReady = data.stage === 'NEEDS_PS' || data.stage === 'CANCELLED';
  const copy = req ? teamRequestCopy(req) : null;
  const called = req?.status === 'CALLED';

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
      <Text style={[styles.label, { color: tokens.textMuted }]}>{[data.team.teamCode, data.team.name].filter(Boolean).join(' · ')}</Text>

      {notReady ? (
        <View style={[styles.card, { marginTop: spacing[3] }]}>
          <CardBackdrop shape={styles.card} />
          <Text style={[styles.title, { color: tokens.text }]}>{stageCopy(data.stage).title}</Text>
          <Text style={[styles.body, { color: tokens.textSecondary }]}>
            {data.stage === 'NEEDS_PS' ? 'Lock in your problem statement to unlock judging.' : stageCopy(data.stage).body}
          </Text>
        </View>
      ) : null}

      {req && copy ? (
        <View style={[styles.card, styles.requestCard, { marginTop: spacing[3], borderColor: called ? tokens.accent : 'transparent' }]}>
          <CardBackdrop shape={styles.card} />
          <Text style={[styles.overline, { color: called ? tokens.accent : tokens.textMuted }]}>{req.roundName ?? 'Evaluation'}</Text>
          <Text style={[styles.bigTitle, { color: tokens.text }]}>{copy.title}</Text>
          <Text style={[styles.body, { color: tokens.textSecondary }]}>{copy.body}</Text>
          {req.evaluator ? (
            <View style={styles.metaRow}>
              <UsersThree size={16} color={tokens.textMuted} />
              <Text style={[styles.meta, { color: tokens.textSecondary }]}>{req.evaluator.name}</Text>
              {req.evaluator.location ? (
                <>
                  <MapPin size={16} color={tokens.textMuted} />
                  <Text style={[styles.meta, { color: tokens.textSecondary }]}>{req.evaluator.location}</Text>
                </>
              ) : null}
            </View>
          ) : null}
          {req.status === 'WAITING' && req.waitMinutes != null ? (
            <Text style={[styles.meta, { color: tokens.textMuted, marginTop: spacing[2] }]}>{waitLabel(req.waitMinutes)}</Text>
          ) : null}
          <View style={{ marginTop: spacing[3] }}>
            {called ? <SlotTimer until={req.graceEndsAt} label="to get there" doneLabel="Hurry, the judge is waiting" /> : null}
            {req.status === 'IN_PROGRESS' ? <SlotTimer until={req.slotEndsAt} label="left in your slot" doneLabel="Time’s up" /> : null}
          </View>
          {req.evaluator?.meetingUrl ? (
            <Button
              label="Join call"
              size="lg"
              fullWidth
              icon={<VideoCamera size={18} color={tokens.accentFg} weight="fill" />}
              onPress={() => void Linking.openURL(req.evaluator!.meetingUrl!)}
              style={{ marginTop: spacing[4] }}
            />
          ) : null}
          {req.status === 'WAITING' || req.status === 'CALLED' ? (
            <Button
              label="Leave queue"
              variant="ghost"
              fullWidth
              loading={busy}
              onPress={() => leave(req.id)}
              style={{ marginTop: spacing[2] }}
            />
          ) : null}
        </View>
      ) : null}

      {data.rounds.length ? (
        <SettingsGroup title="Rounds">
          {data.rounds.map((r) => {
            const blocked = roundBlockedCopy(r, !!req);
            const mentoring = r.kind === 'MENTORING';
            const progress =
              r.required > 1
                ? `${r.completed} of ${r.required} ${mentoring ? 'sessions' : 'evaluations'}`
                : r.completed
                  ? mentoring
                    ? 'Session done'
                    : 'Evaluated'
                  : undefined;
            return (
              <SettingsRow
                key={r.id}
                icon={r.completed >= r.required ? <CheckCircle size={ICON} color={tokens.success} weight="fill" /> : icon(Gavel)}
                label={r.name}
                value={
                  r.canRequest
                    ? mentoring
                      ? 'Pick a mentor'
                      : 'Pick a judge'
                    : progress ?? (r.status === 'ACTIVE' ? 'Open' : r.status === 'CLOSED' ? 'Closed' : 'Not open')
                }
                onPress={r.canRequest ? () => void openPicker(r) : blocked ? () => AppAlert.alert(r.name, blocked) : undefined}
              />
            );
          })}
        </SettingsGroup>
      ) : (
        <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[6] }]}>
          The organisers haven’t set up judging rounds yet. We’ll notify you when a round opens.
        </Text>
      )}

      {picking ? (
        <>
          <SettingsGroup
            title={`${picking.round.kind === 'MENTORING' ? 'Pick a mentor' : picking.round.judgingMode === 'PANEL' ? 'Pick a panel' : 'Pick a judge'} · ${picking.round.name}`}
            action={{ label: 'Cancel', onPress: () => setPicking(null) }}
          >
            {picking.list === null ? <SettingsRow label="Loading…" /> : null}
            {picking.list?.length === 0 ? (
              <SettingsRow label={picking.round.kind === 'MENTORING' ? 'No mentors in this round yet' : 'Nobody is judging your team in this round yet'} />
            ) : null}
            {picking.list?.map((e) => {
              const off = !e.isAvailable || e.alreadyEvaluated;
              return (
                <SettingsRow
                  key={`${e.kind}:${e.id}`}
                  icon={e.isAvailable ? icon(e.online ? VideoCamera : UsersThree) : <Coffee size={ICON} color={tokens.textMuted} />}
                  label={e.location ? `${e.name} · ${e.location}` : e.name}
                  value={
                    e.alreadyEvaluated
                      ? picking.round.kind === 'MENTORING'
                        ? 'Already had a session'
                        : 'Already evaluated you'
                      : !e.isAvailable
                        ? 'On a break'
                        : e.waiting || e.busy
                          ? `${e.waiting} waiting · ${waitLabel(e.waitMinutes)}`
                          : 'Free now'
                  }
                  onPress={off || busy ? undefined : () => join(picking.round, e)}
                />
              );
            })}
          </SettingsGroup>
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            {picking.round.kind === 'MENTORING'
              ? 'Mentors give written feedback, no marks. Each session is with a different mentor.'
              : picking.round.judgingMode === 'MULTI'
              ? 'This round needs evaluations from different judges. Join one queue at a time.'
              : `Each slot is ${picking.round.slotMinutes} minutes. Wait times are a rough guide.`}
          </Text>
        </>
      ) : null}

      {data.history.length ? (
        <SettingsGroup title="Earlier">
          {data.history.map((h) => (
            <SettingsRow
              key={h.id}
              label={[h.roundName, h.evaluatorName].filter(Boolean).join(' · ') || 'Evaluation'}
              value={h.closedReason === 'REMOVED' ? 'Removed by organisers' : evalStatusLabel(h.status)}
            />
          ))}
        </SettingsGroup>
      ) : null}
      <Text style={[styles.note, { color: tokens.textMuted }]}>Marks are never shown to teams. Results come from the organisers.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[5] },
  requestCard: { borderWidth: 2 },
  label: { fontSize: typography.fontSize.sm, ...font('medium') },
  overline: { fontSize: typography.fontSize.xs, letterSpacing: 0.6, textTransform: 'uppercase', ...font('bold') },
  title: { fontSize: typography.fontSize.lg, ...font('semibold') },
  bigTitle: { marginTop: spacing[1], fontSize: typography.fontSize['2xl'], ...font('bold') },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...font() },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[1] + 2, marginTop: spacing[3] },
  meta: { fontSize: typography.fontSize.sm, marginRight: spacing[2], ...font('medium') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
