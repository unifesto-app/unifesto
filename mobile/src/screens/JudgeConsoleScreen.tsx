import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CheckCircle, Hourglass, LockSimple, MegaphoneSimple, PencilSimple, UserMinus, VideoCamera } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { SwitchRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SlotTimer from '../components/hackathon/SlotTimer';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useHackathonSocket, { useNow } from '../hooks/useHackathonSocket';
import {
  callNextTeam,
  getJudgeConsole,
  markNoShow,
  setJudgeAvailability,
  startSlot,
  type ConsoleQueue,
  type JudgeConsole,
  type JudgeSlot,
} from '../lib/api/hackathon';
import type { Result } from '../lib/api/manageEvent';
import { evalStatusLabel, formatClock, secondsUntil } from '../lib/hackathon';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;

/**
 * The judge's console for a hackathon (plan §12): take teams or go on a
 * break, call the next team, start its slot or mark a no-show, give marks,
 * and see what you finished with the 5-minute edit countdown. Call next stays
 * off until marks for the current team are in. Live over the socket.
 */
export default function JudgeConsoleScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<JudgeConsole | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const now = useNow(!!data);

  useAnalyticsScreenTracking('JudgeConsole');

  const load = useCallback(async () => {
    const res = await getJudgeConsole(eventId);
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

  const run = async (p: Promise<Result<JudgeConsole>>, failTitle: string) => {
    setActing(true);
    const res = await p;
    setActing(false);
    if (!res.ok) {
      AppAlert.alert(failTitle, res.message);
      void load();
      return;
    }
    setData(res.data);
  };

  const openMarks = (roundId: string, team: { id: string; teamCode: string | null; name: string }, roundName?: string | null) =>
    router.push({
      pathname: `/judging/${eventId}/${team.id}`,
      params: { roundId, roundName: roundName ?? '', entrantName: [team.teamCode, team.name].filter(Boolean).join(' · ') },
    });

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

  const openRound = data.rounds.some((r) => r.status === 'ACTIVE');
  const mentor = data.kind === 'MENTOR';

  const slotCard = (q: ConsoleQueue, s: JudgeSlot) => {
    const team = s.team;
    const graceLeft = secondsUntil(s.graceEndsAt, now);
    const canNoShow = s.status === 'CALLED' && (graceLeft == null || graceLeft <= 0);
    const marking = s.status === 'IN_PROGRESS' || s.status === 'AWAITING_MARKS';
    const submitted = !!s.myMarks?.submittedAt;
    const meeting = q.meetingUrl;
    return (
      <View key={s.requestId} style={[styles.card, { borderColor: s.status === 'AWAITING_MARKS' ? tokens.warning : tokens.accent }]}>
        <CardBackdrop shape={styles.card} />
        <Text style={[styles.overline, { color: tokens.textMuted }]}>
          {[q.kind === 'PANEL' ? q.name : null, s.round?.name, evalStatusLabel(s.status)].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.teamCode, { color: tokens.text }]}>{team?.teamCode ?? '—'}</Text>
        <Text style={[styles.teamName, { color: tokens.textSecondary }]}>{team?.name}</Text>
        {team?.statement ? (
          <Text style={[styles.body, { color: tokens.text }]} numberOfLines={3}>
            {[team.statement.code, team.statement.title].filter(Boolean).join(' · ')}
            {team.statement.themeLabel ? `  (${team.statement.themeLabel})` : ''}
          </Text>
        ) : null}
        {team?.members.length ? (
          <Text style={[styles.meta, { color: tokens.textMuted }]}>{team.members.join(', ')}</Text>
        ) : null}
        {team?.room ? <Text style={[styles.meta, { color: tokens.textMuted }]}>Room: {team.room.name}</Text> : null}
        {team?.links.length ? (
          <View style={{ marginTop: spacing[2] }}>
            {team.links.map((l) => (
              <Text key={l.url} style={[styles.meta, { color: tokens.accent }]} onPress={() => void Linking.openURL(l.url)} accessibilityRole="link">
                {l.label} ↗
              </Text>
            ))}
            {team.linksNotes ? <Text style={[styles.meta, { color: tokens.textMuted }]}>{team.linksNotes}</Text> : null}
          </View>
        ) : null}

        <View style={{ marginTop: spacing[3] }}>
          {s.status === 'CALLED' ? <SlotTimer until={s.graceEndsAt} label="to arrive" doneLabel="Grace time over" /> : null}
          {s.status === 'IN_PROGRESS' ? <SlotTimer large until={s.slotEndsAt} label="left" doneLabel="Time’s up" /> : null}
          {s.status === 'AWAITING_MARKS' ? (
            <Text style={[styles.meta, { color: tokens.warning }]}>
              Time’s up. Submit your {mentor ? 'feedback' : 'marks'} to call the next team.
            </Text>
          ) : null}
          {s.panelProgress ? (
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              {s.panelProgress.submitted} of {s.panelProgress.total} panel judges have submitted
            </Text>
          ) : null}
        </View>

        {s.status === 'CALLED' ? (
          <View style={styles.actions}>
            <Button
              label="Team is here, start"
              size="lg"
              fullWidth
              loading={acting}
              onPress={() => void run(startSlot(eventId, s.requestId), "Couldn't start")}
            />
            <Button
              label={canNoShow ? 'Mark no-show' : `No-show in ${formatClock(Math.max(0, graceLeft ?? 0))}`}
              variant="ghost"
              fullWidth
              disabled={!canNoShow || acting}
              icon={<UserMinus size={18} color={canNoShow ? tokens.danger : tokens.textMuted} />}
              onPress={() =>
                AppAlert.alert(`${team?.teamCode ?? 'This team'} didn’t turn up?`, 'They leave your queue and are told. They can join a queue again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'No-show', style: 'destructive', onPress: () => void run(markNoShow(eventId, s.requestId), "Couldn't mark it") },
                ])
              }
            />
          </View>
        ) : null}
        {marking && team && s.round ? (
          <View style={styles.actions}>
            <Button
              label={submitted ? `${mentor ? 'Feedback' : 'Marks'} submitted · edit` : mentor ? 'Give feedback' : 'Give marks'}
              size="lg"
              fullWidth
              variant={submitted ? 'secondary' : 'primary'}
              icon={<PencilSimple size={18} color={submitted ? tokens.text : tokens.accentFg} weight="bold" />}
              onPress={() => openMarks(s.round!.id, team, s.round!.name)}
            />
          </View>
        ) : null}
        {meeting ? (
          <Button
            label="Open your call"
            variant="ghost"
            fullWidth
            icon={<VideoCamera size={18} color={tokens.accent} weight="fill" />}
            onPress={() => void Linking.openURL(meeting)}
            style={{ marginTop: spacing[1] }}
          />
        ) : null}
      </View>
    );
  };

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
      <SettingsGroup plain>
        <SwitchRow
          label="Taking teams"
          hint={data.isAvailable ? 'Teams can join your queue.' : 'On a break: teams can’t join your queue.'}
          value={data.isAvailable}
          disabled={acting}
          onValueChange={(v) => void run(setJudgeAvailability(eventId, v), "Couldn't change it")}
        />
      </SettingsGroup>
      {data.location || data.meetingUrl ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Teams find you {data.location ? `at ${data.location}` : ''}
          {data.location && data.meetingUrl ? ' or ' : ''}
          {data.meetingUrl ? 'on your call link' : ''}.
        </Text>
      ) : null}
      {!openRound ? (
        <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[4] }]}>
          No round you {mentor ? 'mentor' : 'judge'} is open right now. We’ll notify you when one opens.
        </Text>
      ) : null}

      {data.queues.filter((q) => q.current).map((q) => slotCard(q, q.current!))}

      {data.queues.map((q) => {
        if (q.kind === 'PANEL' && !openRound && !q.waiting.length) return null;
        const title = q.kind === 'PANEL' ? `${q.name} · queue` : 'Your queue';
        return (
          <View key={`${q.kind}:${q.id}`}>
            <SettingsGroup title={`${title} · ${q.waiting.length} waiting`}>
              {q.waiting.length === 0 ? <SettingsRow label="Nobody waiting" /> : null}
              {q.waiting.map((w) => (
                <SettingsRow
                  key={w.requestId}
                  icon={<Hourglass size={ICON} color={tokens.textMuted} weight="fill" />}
                  label={`${w.position}. ${w.team?.teamCode ?? '—'}  ${w.team?.name ?? ''}`}
                  value={[w.team?.themeLabel, w.roundName].filter(Boolean).join(' · ') || undefined}
                />
              ))}
            </SettingsGroup>
            <Button
              label={q.kind === 'PANEL' ? `Call next for ${q.name}` : 'Call next team'}
              size="lg"
              fullWidth
              loading={acting}
              disabled={!q.canCallNext}
              icon={<MegaphoneSimple size={18} color={q.canCallNext ? tokens.accentFg : tokens.textMuted} weight="fill" />}
              onPress={() => void run(callNextTeam(eventId, q.kind === 'PANEL' ? q.id : undefined), "Couldn't call the next team")}
              style={{ marginTop: spacing[3] }}
            />
            {data.busy && q.waiting.length ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>
                {data.busy.status === 'CALLED'
                  ? `Start ${data.busy.teamCode ?? 'the called team'} or mark it a no-show first.`
                  : `Submit ${mentor ? 'feedback' : 'marks'} for ${data.busy.teamCode ?? 'the current team'} to call the next one.`}
              </Text>
            ) : null}
          </View>
        );
      })}

      {data.recent.length ? (
        <SettingsGroup title="Recently">
          {data.recent.map((r) => {
            const left = secondsUntil(r.editableUntil, now);
            const editable = r.status === 'COMPLETED' && r.submittedAt && !r.locked && left != null && left > 0;
            return (
              <SettingsRow
                key={r.requestId}
                icon={
                  r.status === 'NO_SHOW' ? (
                    <UserMinus size={ICON} color={tokens.textMuted} />
                  ) : editable ? (
                    <PencilSimple size={ICON} color={tokens.accent} weight="fill" />
                  ) : r.submittedAt ? (
                    <LockSimple size={ICON} color={tokens.textMuted} weight="fill" />
                  ) : (
                    <CheckCircle size={ICON} color={tokens.success} weight="fill" />
                  )
                }
                label={`${r.team?.teamCode ?? '—'}  ${r.team?.name ?? ''}`}
                value={
                  r.status === 'NO_SHOW'
                    ? 'No-show'
                    : editable
                      ? `Editable ${formatClock(left!)}`
                      : r.submittedAt
                        ? 'Locked'
                        : evalStatusLabel(r.status)
                }
                onPress={r.team && r.status === 'COMPLETED' ? () => openMarks(r.roundId, r.team!, r.roundName) : undefined}
              />
            );
          })}
        </SettingsGroup>
      ) : null}
      <Text style={[styles.note, { color: tokens.textMuted }]}>
        You can change your {mentor ? 'feedback' : 'marks'} for 5 minutes after you submit. After that {mentor ? 'it locks' : 'they lock'}; the
        organisers can reopen {mentor ? 'it' : 'them'} if needed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  card: { marginTop: spacing[5], borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[5], borderWidth: 2 },
  overline: { fontSize: typography.fontSize.xs, letterSpacing: 0.6, textTransform: 'uppercase', ...font('bold') },
  teamCode: { marginTop: spacing[1], fontSize: typography.fontSize['3xl'], letterSpacing: 0.5, ...font('bold') },
  teamName: { fontSize: typography.fontSize.lg, ...font('medium') },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...font() },
  meta: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...font() },
  actions: { marginTop: spacing[4], gap: spacing[2] },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
