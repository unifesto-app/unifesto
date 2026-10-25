import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import useTopSpacing from '../hooks/useTopSpacing';
import { useEngagementSocket } from '../hooks/useHackathonSocket';
import { getQaBoard, moderateQuestion, setQaPremoderated, type QaBoard, type Question, type QuestionStatus } from '../lib/api/questions';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];
const TABS: { key: QuestionStatus; label: string }[] = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Live' },
  { key: 'ANSWERED', label: 'Answered' },
  { key: 'HIDDEN', label: 'Hidden' },
];
const EMPTY: Record<QuestionStatus, string> = {
  PENDING: 'Nothing waiting.',
  APPROVED: 'No live questions.',
  ANSWERED: 'Nothing answered yet.',
  HIDDEN: 'Nothing hidden.',
};

/** Live Q&A moderation for one event (event:edit): the compact queue. Space web has the full one. */
export default function QuestionsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [board, setBoard] = useState<QaBoard | null>(null);
  const [tab, setTab] = useState<QuestionStatus>('PENDING');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getQaBoard(eventId);
    if (res.ok) {
      setBoard(res.data);
      setError('');
    } else {
      setError(res.denied ? "You can't moderate this event's Q&A." : res.message);
      setBoard((b) => b ?? { premoderated: true, sessions: [], questions: [] });
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
  };

  if (!board) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const act = (q: Question, change: Parameters<typeof moderateQuestion>[2]) => void run(q.id, () => moderateQuestion(eventId!, q.id, change));
  const count = (s: QuestionStatus) => board.questions.filter((q) => q.status === s).length;
  const shown = board.questions.filter((q) => q.status === tab);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.primary}
          colors={[c.primary]}
          progressViewOffset={topSpacing}
        />
      }
    >
      <Text style={[styles.intro, { color: c.soft }]}>
        Attendees ask and upvote from their ticket while the event is on.
      </Text>
      {error ? <Text style={[styles.intro, { color: c.danger }]}>{error}</Text> : null}

      <SettingsGroup plain>
        <View style={styles.toggle}>
          <Text style={[styles.toggleLabel, { color: c.text }]}>Approve questions first</Text>
          <Switch
            value={board.premoderated}
            disabled={busy === 'mode'}
            onValueChange={(v) => void run('mode', () => setQaPremoderated(eventId!, v))}
            accessibilityLabel="Approve questions before attendees see them"
          />
        </View>
      </SettingsGroup>

      <SegmentedTabs tabs={TABS.map((t) => ({ key: t.key, label: `${t.label} ${count(t.key)}` }))} value={tab} onChange={setTab} />

      {shown.length === 0 ? <Text style={[styles.intro, { color: c.muted }]}>{EMPTY[tab]}</Text> : null}
      {shown.map((q) => (
        <SettingsGroup key={q.id} title={`${q.votes} upvote${q.votes === 1 ? '' : 's'}${q.pinned ? ' · Pinned' : ''}`}>
          <View style={styles.question}>
            <Text style={[styles.text, { color: c.text }]}>{q.text}</Text>
            <Text style={[styles.meta, { color: c.muted }]}>{[q.author, q.agendaTitle].filter(Boolean).join(' · ')}</Text>
            <View style={styles.actions}>
              {q.status !== 'APPROVED' ? (
                <Button
                  label={q.status === 'PENDING' ? 'Approve' : q.status === 'ANSWERED' ? 'Reopen' : 'Show'}
                  size="sm"
                  loading={busy === q.id}
                  onPress={() => act(q, { status: 'APPROVED' })}
                />
              ) : null}
              {q.status === 'PENDING' || q.status === 'APPROVED' ? (
                <Button label="Answered" size="sm" variant="secondary" onPress={() => act(q, { status: 'ANSWERED' })} />
              ) : null}
              {q.status === 'APPROVED' || q.status === 'ANSWERED' ? (
                <Button label={q.pinned ? 'Unpin' : 'Pin'} size="sm" variant="secondary" onPress={() => act(q, { pinned: !q.pinned })} />
              ) : null}
              {q.status !== 'HIDDEN' ? <Button label="Hide" size="sm" variant="ghost" onPress={() => act(q, { status: 'HIDDEN' })} /> : null}
            </View>
          </View>
        </SettingsGroup>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 140, gap: spacing[4] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[4], gap: spacing[3] },
  toggleLabel: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  question: { padding: spacing[4], gap: spacing[2] },
  text: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
});
