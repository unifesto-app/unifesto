import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CheckCircle, Hourglass, LockSimple, MegaphoneSimple, PencilSimple, UserMinus, VideoCamera } from '@unifesto/unicon/react-native';
import { CardBackdrop } from '../components/ui/CardSurface';
import ShadeCard from '../components/ui/ShadeCard';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { SwitchRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SlotTimer from '../components/hackathon/SlotTimer';
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
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

/**
 * The judge's console for a hackathon (plan §12): take teams or go on a
 * break, call the next team, start its slot or mark a no-show, give marks,
 * and see what you finished with the 5-minute edit countdown. Call next stays
 * off until marks for the current team are in. Live over the socket.
 */
export default function JudgeConsoleScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const c = useCosmos();
  const [data, setData] = useState<JudgeConsole | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const now = useNow(!!data);

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
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const openRound = data.rounds.some((r) => r.status === 'ACTIVE');
  const mentor = data.kind === 'MENTOR';

  // The first team in a slot is the screen's hero (blue shade); any other is a plain card.
  const slotCard = (q: ConsoleQueue, s: JudgeSlot, hero: boolean) => {
    const team = s.team;
    const graceLeft = secondsUntil(s.graceEndsAt, now);
    const canNoShow = s.status === 'CALLED' && (graceLeft == null || graceLeft <= 0);
    const marking = s.status === 'IN_PROGRESS' || s.status === 'AWAITING_MARKS';
    const submitted = !!s.myMarks?.submittedAt;
    const meeting = q.meetingUrl;
    const content = (
      <>
        <Text style={[styles.overline, { color: c.soft }]}>
          {[q.kind === 'PANEL' ? q.name : null, s.round?.name, evalStatusLabel(s.status)].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.teamCode, { color: c.text }]}>{team?.teamCode ?? '–'}</Text>
        <Text style={[styles.teamName, { color: c.text }]}>{team?.name}</Text>
        {team?.statement ? (
          <Text style={[styles.body, { color: c.soft }]} numberOfLines={3}>
            {[team.statement.code, team.statement.title].filter(Boolean).join(' · ')}
            {team.statement.themeLabel ? `  (${team.statement.themeLabel})` : ''}
          </Text>
        ) : null}
        {team?.members.length ? (
          <Text style={[styles.meta, { color: c.muted }]}>{team.members.join(', ')}</Text>
        ) : null}
        {team?.room ? <Text style={[styles.meta, { color: c.muted }]}>Room: {team.room.name}</Text> : null}
        {team?.links.length ? (
          <View style={{ marginTop: spacing[2] }}>
            {team.links.map((l) => (
              <Text key={l.url} style={[styles.link, { color: c.text }]} onPress={() => void Linking.openURL(l.url)} accessibilityRole="link">
                {l.label} ↗
              </Text>
            ))}
            {team.linksNotes ? <Text style={[styles.meta, { color: c.muted }]}>{team.linksNotes}</Text> : null}
          </View>
        ) : null}

        <View style={{ marginTop: spacing[4] }}>
          {s.status === 'CALLED' ? <SlotTimer until={s.graceEndsAt} label="to arrive" doneLabel="Grace time over" /> : null}
          {s.status === 'IN_PROGRESS' ? <SlotTimer large until={s.slotEndsAt} label="left" doneLabel="Time’s up" /> : null}
          {s.status === 'AWAITING_MARKS' ? (
            <Text style={[styles.meta, { color: c.warn }]}>
              Time’s up. Submit your {mentor ? 'feedback' : 'marks'} to call the next team.
            </Text>
          ) : null}
          {s.panelProgress ? (
            <Text style={[styles.meta, { color: c.muted }]}>
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
              icon={<UserMinus size={18} color={canNoShow ? c.danger : c.muted} />}
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
              icon={<PencilSimple size={18} color={submitted ? c.text : c.primaryFg} weight="bold" />}
              onPress={() => openMarks(s.round!.id, team, s.round!.name)}
            />
          </View>
        ) : null}
        {meeting ? (
          <Button
            label="Open my call"
            variant="ghost"
            fullWidth
            icon={<VideoCamera size={18} color={c.text} />}
            onPress={() => void Linking.openURL(meeting)}
            style={{ marginTop: spacing[1] }}
          />
        ) : null}
      </>
    );
    return hero ? (
      <ShadeCard key={s.requestId} tone="blue" style={styles.slot}>
        {content}
      </ShadeCard>
    ) : (
      <View key={s.requestId} style={[styles.card, styles.slot]}>
        <CardBackdrop shape={styles.card} />
        {content}
      </View>
    );
  };
  const current = data.queues.filter((q) => q.current);

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
      {current.map((q, i) => slotCard(q, q.current!, i === 0))}

      <SettingsGroup plain style={{ marginTop: 0 }}>
        <SwitchRow
          label="Taking teams"
          hint={data.isAvailable ? 'Teams can join your queue.' : 'On a break: teams can’t join your queue.'}
          value={data.isAvailable}
          disabled={acting}
          onValueChange={(v) => void run(setJudgeAvailability(eventId, v), "Couldn't change it")}
        />
      </SettingsGroup>
      {data.location || data.meetingUrl ? (
        <Text style={[styles.note, { color: c.muted }]}>
          Teams find you {data.location ? `at ${data.location}` : ''}
          {data.location && data.meetingUrl ? ' or ' : ''}
          {data.meetingUrl ? 'on your call link' : ''}.
        </Text>
      ) : null}
      {!openRound ? (
        <View style={[styles.empty, { marginTop: spacing[4] }]}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyText, { color: c.soft }]}>
            No round you {mentor ? 'mentor' : 'judge'} is open right now. We’ll notify you when one opens.
          </Text>
        </View>
      ) : null}

      {data.queues.map((q) => {
        if (q.kind === 'PANEL' && !openRound && !q.waiting.length) return null;
        const title = q.kind === 'PANEL' ? `${q.name} · queue` : 'My queue';
        return (
          <View key={`${q.kind}:${q.id}`}>
            <SettingsGroup title={`${title} · ${q.waiting.length} waiting`}>
              {q.waiting.length === 0 ? <SettingsRow label="Nobody waiting" /> : null}
              {q.waiting.map((w) => (
                <SettingsRow
                  key={w.requestId}
                  icon={<Hourglass size={ICON} color={c.muted} />}
                  label={`${w.position}. ${w.team?.teamCode ?? '–'}  ${w.team?.name ?? ''}`}
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
              icon={<MegaphoneSimple size={18} color={q.canCallNext ? c.primaryFg : c.muted} weight="fill" />}
              onPress={() => void run(callNextTeam(eventId, q.kind === 'PANEL' ? q.id : undefined), "Couldn't call the next team")}
              style={{ marginTop: spacing[3] }}
            />
            {data.busy && q.waiting.length ? (
              <Text style={[styles.note, { color: c.muted }]}>
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
                    <UserMinus size={ICON} color={c.muted} />
                  ) : editable ? (
                    <PencilSimple size={ICON} color={c.text} />
                  ) : r.submittedAt ? (
                    <LockSimple size={ICON} color={c.success} weight="fill" />
                  ) : (
                    <CheckCircle size={ICON} color={c.success} weight="fill" />
                  )
                }
                label={`${r.team?.teamCode ?? '–'}  ${r.team?.name ?? ''}`}
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
      <Text style={[styles.note, { color: c.muted }]}>
        You can change your {mentor ? 'feedback' : 'marks'} for 5 minutes after you submit. After that {mentor ? 'it locks' : 'they lock'}; the
        organisers can reopen {mentor ? 'it' : 'them'} if needed.
      </Text>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[5] },
  slot: { marginBottom: spacing[4] },
  overline: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  teamCode: { marginTop: spacing[3], fontSize: 40, lineHeight: 46, ...cosmosFont.figure },
  teamName: { marginTop: spacing[1], fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  link: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
  meta: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...cosmosFont.body },
  actions: { marginTop: spacing[4], gap: spacing[2] },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
