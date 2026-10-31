import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useEngagementSocket } from '../hooks/useHackathonSocket';
import { getQaBoard, moderateQuestion, setQaPremoderated, type QaBoard, type Question, type QuestionStatus } from '../lib/api/questions';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { SwitchRow } from '../components/manage/FormFields';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const act = (q: Question, change: Parameters<typeof moderateQuestion>[2]) => void run(q.id, () => moderateQuestion(eventId!, q.id, change));
  const count = (s: QuestionStatus) => board.questions.filter((q) => q.status === s).length;
  const shown = board.questions.filter((q) => q.status === tab);

  return (
    <CosmosScreen
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
        Attendees ask and upvote from their ticket while the event is on.
      </Text>
      {error ? <Text style={[styles.intro, { color: c.danger }]}>{error}</Text> : null}

      <SettingsGroup plain>
        <SwitchRow
          label="Approve questions first"
          value={board.premoderated}
          disabled={busy === 'mode'}
          onValueChange={(v) => void run('mode', () => setQaPremoderated(eventId!, v))}
        />
      </SettingsGroup>

      <SegmentedTabs tabs={TABS.map((t) => ({ key: t.key, label: `${t.label} ${count(t.key)}` }))} value={tab} onChange={setTab} />

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyText, { color: c.soft }]}>{EMPTY[tab]}</Text>
        </View>
      ) : null}
      {shown.map((q) => (
        <SettingsGroup key={q.id}>
          <View style={styles.question}>
            <Text style={[styles.text, { color: c.text }]}>{q.text}</Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              <Text style={[styles.votes, { color: c.text }]}>{q.votes}</Text>
              {` ${[`upvote${q.votes === 1 ? '' : 's'}`, q.pinned ? 'Pinned' : null, q.author, q.agendaTitle].filter(Boolean).join(' · ')}`}
            </Text>
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
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing[4] },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  question: { padding: spacing[5], gap: spacing[2] },
  text: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
  meta: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  votes: { ...cosmosFont.figure },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
});
