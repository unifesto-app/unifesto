import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import { useEngagementSocket } from '../hooks/useHackathonSocket';
import {
  closePoll,
  createPoll,
  deletePoll,
  getManagedPolls,
  launchPoll,
  type Poll,
  type PollResultsVisibility,
} from '../lib/api/polls';
import { FieldRow } from '../components/manage/FormFields';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const VISIBILITY: { key: PollResultsVisibility; label: string }[] = [
  { key: 'AFTER_VOTE', label: 'After voting' },
  { key: 'AFTER_CLOSE', label: 'At close' },
  { key: 'ORGANISERS_ONLY', label: 'Only us' },
];
const STATUS_LABEL = { DRAFT: 'Draft', LIVE: 'Live', CLOSED: 'Closed' } as const;

/** Live polls for one event (event:edit): draft, launch, watch votes, close. */
export default function PollsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [visibility, setVisibility] = useState<PollResultsVisibility>('AFTER_VOTE');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getManagedPolls(eventId);
    if (res.ok) {
      setPolls(res.data);
      setError('');
    } else {
      setError(res.denied ? "You can't run polls for this event." : res.message);
      setPolls((p) => p ?? []);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEngagementSocket(eventId, load);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) AppAlert.alert("Couldn't do that", res.message);
    await load();
    return res.ok;
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = !!question.trim() && filled.length >= 2;

  const create = async () => {
    const ok = await run('create', () =>
      createPoll(eventId!, { question: question.trim(), options: filled, resultsVisibility: visibility }),
    );
    if (ok) {
      setQuestion('');
      setOptions(['', '']);
    }
  };

  const remove = (p: Poll) =>
    AppAlert.alert('Delete this poll?', 'Its votes go with it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(p.id, () => deletePoll(eventId!, p.id)) },
    ]);

  if (!polls) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      keyboard
      bottom={140}
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <Text style={[styles.intro, { color: c.soft }]}>
        Attendees vote from their ticket while the event is on, once each. Results update live.
      </Text>
      {error ? <Text style={[styles.intro, { color: c.danger }]}>{error}</Text> : null}

      {polls.map((p) => {
        const total = p.totalVotes ?? 0;
        return (
          <SettingsGroup key={p.id} title={`${STATUS_LABEL[p.status]} · ${total} vote${total === 1 ? '' : 's'}`}>
            <View style={styles.poll}>
              <Text style={[styles.question, { color: c.text }]}>{p.question}</Text>
              {p.options.map((o, i) => {
                const n = p.results?.[i] ?? 0;
                const pct = total ? Math.round((n / total) * 100) : 0;
                return (
                  <View key={i} style={styles.result}>
                    <View style={styles.resultRow}>
                      <Text style={[styles.option, { color: c.text }]}>{o}</Text>
                      <Text style={[styles.count, { color: c.muted }]}>
                        {n} · {pct}%
                      </Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: c.tint }]}>
                      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.primary }]} />
                    </View>
                  </View>
                );
              })}
              <View style={styles.actions}>
                {p.status === 'DRAFT' ? (
                  <Button label="Launch" size="sm" loading={busy === p.id} onPress={() => void run(p.id, () => launchPoll(eventId!, p.id))} />
                ) : null}
                {p.status === 'LIVE' ? (
                  <Button
                    label="Close poll"
                    size="sm"
                    variant="secondary"
                    loading={busy === p.id}
                    onPress={() => void run(p.id, () => closePoll(eventId!, p.id))}
                  />
                ) : null}
                {p.status !== 'LIVE' ? <Button label="Delete" size="sm" variant="ghost" onPress={() => remove(p)} /> : null}
              </View>
            </View>
          </SettingsGroup>
        );
      })}

      <SettingsGroup title="New poll" plain>
        <FieldRow stacked label="Question" value={question} onChangeText={setQuestion} maxLength={300} placeholder="Which session should we repeat?" />
        {options.map((o, i) => (
          <FieldRow
            key={i}
            stacked
            label={`Option ${i + 1}`}
            value={o}
            maxLength={120}
            onChangeText={(v) => setOptions((all) => all.map((x, j) => (j === i ? v : x)))}
          />
        ))}
      </SettingsGroup>
      {options.length < 10 ? (
        <Button
          label="Add option"
          variant="ghost"
          size="sm"
          icon={<Plus size={16} color={c.text} weight="bold" />}
          onPress={() => setOptions((all) => [...all, ''])}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
      <Text style={[styles.label, { color: c.soft }]}>Attendees see results</Text>
      <SegmentedTabs tabs={VISIBILITY} value={visibility} onChange={setVisibility} />
      <Button
        label="Save as draft"
        fullWidth
        disabled={!canCreate}
        loading={busy === 'create'}
        onPress={() => void create()}
        style={{ marginTop: spacing[5] }}
      />
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing[4] },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  label: { marginLeft: spacing[1], marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  poll: { padding: spacing[4], gap: spacing[3] },
  question: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  result: { gap: spacing[1] },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] },
  option: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  count: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  track: { height: 6, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: 6, borderRadius: borderRadius.full },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
});
