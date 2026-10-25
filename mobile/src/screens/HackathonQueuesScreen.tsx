import React, { useCallback, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Broadcast, Coffee, Gavel, Hourglass, LockOpen, UsersFour, WifiSlash } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { Button } from '../components/ui';
import { GUTTER } from '../components/home/Section';
import { GroupCell, SettingsGroupHeader, SettingsRow } from '../components/profile/SettingsGroup';
import SlotTimer from '../components/hackathon/SlotTimer';
import useTopSpacing from '../hooks/useTopSpacing';
import useHackathonSocket from '../hooks/useHackathonSocket';
import {
  forceComplete,
  getQueues,
  reassignRequest,
  removeFromQueue,
  reopenJudgment,
  updateJudge,
  updatePanel,
  type MonitorQueue,
  type QueueMonitor,
  type QueueTeam,
} from '../lib/api/hackathon';
import type { Result } from '../lib/api/manageEvent';
import { evalStatusLabel } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

const teamLabel = (t: QueueTeam | null) => (t ? `${t.teamCode ?? '—'}  ${t.name}` : 'Team');

/** One titled card of rows. Rows are built up front (cheap) and only mounted when scrolled near. */
type Group = { key: string; title: string; action?: { label: string; onPress: () => void }; data: { key: string; row: React.ReactElement }[] };

/**
 * The curator's live view of every judge's and panel's queue: who's in a slot
 * and who's waiting. Take a team out of a queue, move it to another judge,
 * finish a stuck slot, pause a judge, and reopen locked marks.
 */
export default function HackathonQueuesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<QueueMonitor | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getQueues(eventId);
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
  const { live } = useHackathonSocket(eventId, () => void load());

  const run = async (p: Promise<Result<QueueMonitor>>, failTitle: string) => {
    const res = await p;
    if (!res.ok) return AppAlert.alert(failTitle, res.message);
    setData(res.data);
  };

  if (!data) {
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

  const move = (q: MonitorQueue, requestId: string, team: QueueTeam | null) => {
    const others = data.queues.filter((x) => x.kind === q.kind && x.id !== q.id);
    if (!others.length) return AppAlert.alert('Nowhere to move it', q.kind === 'PANEL' ? 'Add another panel first.' : 'Add another judge first.');
    AppAlert.alert(`Move ${team?.teamCode ?? 'this team'} to…`, 'It keeps its place in time in the new queue.', [
      ...others.map((o) => ({
        text: `${o.name}${o.waiting.length ? ` (${o.waiting.length} waiting)` : ''}`,
        onPress: () =>
          void run(
            reassignRequest(eventId!, requestId, o.kind === 'PANEL' ? { panelId: o.id } : { judgeUserId: o.id }),
            "Couldn't move the team",
          ),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const waitingActions = (q: MonitorQueue, requestId: string, team: QueueTeam | null) =>
    AppAlert.alert(teamLabel(team), `Waiting for ${q.name}.`, [
      { text: 'Move to another judge', onPress: () => move(q, requestId, team) },
      {
        text: 'Remove from queue',
        style: 'destructive',
        onPress: () => void run(removeFromQueue(eventId!, requestId), "Couldn't remove"),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const slotActions = (q: MonitorQueue) => {
    const c = q.current!;
    AppAlert.alert(teamLabel(c.team), `${evalStatusLabel(c.status)} with ${q.name}.`, [
      ...(c.status === 'CALLED' ? [{ text: 'Move to another judge', onPress: () => move(q, c.requestId, c.team) }] : []),
      {
        // With no marks, finishing would end the team's turn with nothing: it can only be a no-show.
        text: c.marked ? 'Finish the slot now' : 'Close as a no-show',
        onPress: () =>
          AppAlert.alert(
            c.marked ? 'Finish this slot?' : 'Close as a no-show?',
            c.marked
              ? 'Marks already submitted count. Judges who haven’t submitted can’t add theirs afterwards.'
              : 'No judge has marked this team yet. The team is told and can join a queue again.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: c.marked ? 'Finish' : 'No-show', style: 'destructive', onPress: () => void run(forceComplete(eventId!, c.requestId, !c.marked), "Couldn't finish") },
            ],
          ),
      },
      {
        text: 'Remove from queue',
        style: 'destructive',
        onPress: () => void run(removeFromQueue(eventId!, c.requestId), "Couldn't remove"),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const togglePause = async (q: MonitorQueue) => {
    const res =
      q.kind === 'PANEL'
        ? await updatePanel(eventId!, q.id, { isAvailable: !q.isAvailable })
        : await updateJudge(eventId!, q.judgeId!, { isAvailable: !q.isAvailable });
    if (!res.ok) return AppAlert.alert("Couldn't change it", res.message);
    void load();
  };

  const reopen = (judgmentId: string, judgeName: string, team: QueueTeam | null) =>
    AppAlert.alert(`Reopen ${judgeName}’s marks?`, `They get 5 more minutes to change their marks for ${team?.teamCode ?? 'this team'}. They’re notified.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reopen', onPress: () => void run(reopenJudgment(eventId!, judgmentId), "Couldn't reopen") },
    ]);

  const active = data.queues.filter((q) => q.current || q.waiting.length);
  const idle = data.queues.filter((q) => !q.current && !q.waiting.length);
  const reopenable = data.recent.flatMap((r) =>
    r.roundActive ? r.judgments.filter((j) => j.locked).map((j) => ({ ...j, team: r.team, roundName: r.roundName })) : [],
  );

  const queueGroup = (q: MonitorQueue): Group => ({
    key: `${q.kind}:${q.id}`,
    title: `${q.name}${q.role === 'MENTOR' ? ' (mentor)' : ''}${q.location ? ` · ${q.location}` : ''}`,
    action: { label: q.isAvailable ? 'Pause' : 'Resume', onPress: () => void togglePause(q) },
    data: [
      ...(!q.isAvailable
        ? [{ key: 'break', row: <SettingsRow icon={<Coffee size={ICON} color={c.muted} />} label="On a break" /> }]
        : []),
      ...(q.current
        ? [
            {
              key: 'current',
              row: (
                <SettingsRow
                  icon={<Gavel size={ICON} color={q.current.status === 'AWAITING_MARKS' ? c.warn : c.success} weight="fill" />}
                  label={teamLabel(q.current.team)}
                  value={evalStatusLabel(q.current.status)}
                  trailing={q.current.status === 'IN_PROGRESS' ? <SlotTimer until={q.current.slotEndsAt} label="" doneLabel="Time’s up" /> : undefined}
                  onPress={() => slotActions(q)}
                />
              ),
            },
          ]
        : []),
      ...q.waiting.map((w) => ({
        key: w.requestId,
        row: (
          <SettingsRow
            icon={<Hourglass size={ICON} color={c.muted} />}
            label={`${w.position}. ${teamLabel(w.team)}`}
            value={w.roundName ?? undefined}
            onPress={() => waitingActions(q, w.requestId, w.team)}
          />
        ),
      })),
    ],
  });

  const groups: Group[] = active.map(queueGroup);
  if (reopenable.length) {
    groups.push({
      key: 'reopen',
      title: 'Locked marks you can reopen',
      data: reopenable.slice(0, 15).map((j) => ({
        key: j.id,
        row: (
          <SettingsRow
            icon={<LockOpen size={ICON} color={c.text} />}
            label={`${teamLabel(j.team)}`}
            value={j.judgeName}
            onPress={() => reopen(j.id, j.judgeName, j.team)}
          />
        ),
      })),
    });
  }
  if (idle.length) {
    groups.push({
      key: 'idle',
      title: 'Free',
      data: idle.map((q) => ({
        key: `${q.kind}:${q.id}`,
        row: (
          <SettingsRow
            icon={
              q.isAvailable ? (
                q.kind === 'PANEL' ? <UsersFour size={ICON} color={c.text} /> : <Gavel size={ICON} color={c.text} />
              ) : (
                <Coffee size={ICON} color={c.muted} weight="fill" />
              )
            }
            label={q.name}
            value={q.isAvailable ? 'Free' : 'On a break'}
            onPress={() =>
              AppAlert.alert(q.name, q.isAvailable ? 'Pause them so teams can’t join their queue?' : 'Let teams join their queue again?', [
                { text: 'Cancel', style: 'cancel' },
                { text: q.isAvailable ? 'Pause' : 'Resume', onPress: () => void togglePause(q) },
              ])
            }
          />
        ),
      })),
    });
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <SectionList
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 100 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
        sections={groups}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <>
            <View style={styles.liveRow}>
              {live ? <Broadcast size={16} color={c.success} weight="fill" /> : <WifiSlash size={16} color={c.muted} />}
              <Text style={[styles.note, { color: live ? c.success : c.muted, marginTop: 0 }]}>
                {live ? 'Live' : 'Refreshing every 10 seconds'}
                {data.activeRounds.length ? ` · ${data.activeRounds.map((r) => r.name).join(', ')} open` : ' · No round open'}
              </Text>
            </View>
            {!active.length ? (
              <View style={[styles.empty, { backgroundColor: c.raised, marginTop: spacing[5] }]}>
                <Text style={[styles.emptyText, { color: c.soft }]}>Nobody is in a queue right now.</Text>
              </View>
            ) : null}
          </>
        }
        renderSectionHeader={({ section }) => <SettingsGroupHeader title={section.title} action={section.action} />}
        renderItem={({ item, index, section }) => (
          <GroupCell index={index} count={section.data.length}>
            {item.row}
          </GroupCell>
        )}
        ListFooterComponent={
          <Text style={[styles.note, { color: c.muted }]}>
            Marks lock 5 minutes after a judge submits. Reopening gives them 5 more minutes; you never change marks yourself.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginHorizontal: spacing[1] },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
