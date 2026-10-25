import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { useEngagementSocket } from '../hooks/useHackathonSocket';
import { getManagedQuizzes, stepQuiz, type ManagedQuiz } from '../lib/api/quizzes';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/** Answer counts move without a ping; refetch this often while a quiz runs. */
const LIVE_REFRESH_MS = 2000;
const STATUS_LABEL = { DRAFT: 'Draft', LIVE: 'Live', ENDED: 'Ended' } as const;
const ORDER = { LIVE: 0, DRAFT: 1, ENDED: 2 } as const;
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * Run an event's live quizzes from the floor (event:edit): start, close the
 * question early, next, end. Quizzes are built on the Space web dashboard.
 */
export default function QuizRunnerScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const [quizzes, setQuizzes] = useState<ManagedQuiz[] | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getManagedQuizzes(eventId);
    if (res.ok) {
      setQuizzes([...res.data].sort((a, b) => ORDER[a.status] - ORDER[b.status]));
      if (res.data[0]) setSkew(ms(res.data[0].serverNow) - Date.now());
      setError('');
    } else {
      setError(res.denied ? "You can't run quizzes for this event." : res.message);
      setQuizzes((q) => q ?? []);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEngagementSocket(eventId, load);

  const live = !!quizzes?.some((q) => q.status === 'LIVE');
  useEffect(() => {
    if (!live) return;
    const poll = setInterval(() => void load(), LIVE_REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [live, load]);

  const step = async (quiz: ManagedQuiz, action: Parameters<typeof stepQuiz>[2]) => {
    setBusy(quiz.id);
    const res = await stepQuiz(eventId!, quiz.id, action);
    setBusy(null);
    if (!res.ok) AppAlert.alert("Couldn't do that", res.message);
    await load();
  };

  const end = (quiz: ManagedQuiz, isLast: boolean) =>
    isLast
      ? void step(quiz, 'end')
      : AppAlert.alert('End the quiz now?', 'Questions not yet asked are skipped.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End quiz', style: 'destructive', onPress: () => void step(quiz, 'end') },
        ]);

  if (!quizzes) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const serverNow = now + skew;

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
        Build quizzes on the Space dashboard on the web. Run them from here: attendees answer from their ticket and
        the leaderboard updates after each question.
      </Text>
      {error ? (
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4], alignSelf: 'center' }} />
        </View>
      ) : null}
      {!quizzes.length && !error ? (
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.emptyText, { color: c.soft }]}>No quizzes for this event yet.</Text>
        </View>
      ) : null}

      {quizzes.map((z) => {
        const q = z.status === 'LIVE' && z.currentIndex !== null ? z.questions[z.currentIndex] : null;
        const isLast = z.currentIndex !== null && z.currentIndex + 1 >= z.questions.length;
        const opensIn = q ? Math.ceil((ms(q.openedAt) - serverNow) / 1000) : 0;
        const left = q ? Math.max(0, Math.ceil((ms(q.closesAt) - serverNow) / 1000)) : 0;
        return (
          <SettingsGroup key={z.id} title={`${STATUS_LABEL[z.status]} · ${z.questions.length} questions`}>
            <View style={styles.quiz}>
              <Text style={[styles.title, { color: c.text }]}>{z.title}</Text>
              {q ? (
                <View style={styles.question}>
                  <Text style={[styles.meta, { color: c.muted }]}>
                    Question {q.position + 1} of {z.questions.length} ·{' '}
                    {q.closed ? 'Closed' : opensIn > 0 ? `Starts in ${opensIn}s` : `${left}s left`} · {q.answered} answered
                  </Text>
                  <Text style={[styles.prompt, { color: c.text }]}>{q.prompt}</Text>
                  {q.closed
                    ? q.options.map((o, i) => (
                        <Text key={i} style={[styles.meta, { color: q.correctIndexes.includes(i) ? c.text : c.muted }]}>
                          {q.correctIndexes.includes(i) ? 'Right: ' : ''}
                          {o} · {q.results[i] ?? 0}
                        </Text>
                      ))
                    : null}
                </View>
              ) : null}
              {z.leaderboard?.top.length ? (
                <View style={styles.question}>
                  <Text style={[styles.meta, { color: c.soft }]}>
                    {z.status === 'ENDED' ? 'Final leaderboard' : 'Leaderboard'} · {z.leaderboard.players} playing
                  </Text>
                  {z.leaderboard.top.slice(0, 5).map((r, i) => (
                    <Text key={i} style={[styles.meta, { color: c.text }]}>
                      {r.rank}. {r.name} · {r.score}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={styles.actions}>
                {z.status === 'DRAFT' ? (
                  <Button label="Start quiz" size="sm" loading={busy === z.id} onPress={() => void step(z, 'start')} />
                ) : null}
                {q && !q.closed ? (
                  <Button
                    label="Close question"
                    size="sm"
                    variant="secondary"
                    loading={busy === z.id}
                    onPress={() => void step(z, 'close-question')}
                  />
                ) : null}
                {q && !isLast ? (
                  <Button label="Next question" size="sm" loading={busy === z.id} onPress={() => void step(z, 'next')} />
                ) : null}
                {z.status === 'LIVE' ? (
                  <Button label="End quiz" size="sm" variant="ghost" disabled={busy === z.id} onPress={() => end(z, isLast)} />
                ) : null}
              </View>
            </View>
          </SettingsGroup>
        );
      })}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing[4] },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  quiz: { padding: spacing[4], gap: spacing[3] },
  title: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  question: { gap: spacing[1] },
  prompt: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...cosmosFont.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
});
