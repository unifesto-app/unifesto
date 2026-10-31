import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, XCircle } from '@unifesto/unicon/react-native';
import { useEngagementSocket } from '../../hooks/useHackathonSocket';
import { answerQuiz, getQuizFeed, type Leaderboard, type QuizFeed } from '../../lib/api/quizzes';
import { AppAlert } from '../ui/AppAlert';
import { CardBackdrop } from '../ui/CardSurface';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

/** Spread the whole room's refetch at reveal over this much time. */
const REVEAL_JITTER_MS = 1500;
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * L3: the event's live quiz on the attendee's ticket. Mount it only while the
 * event is on. Renders nothing until an organiser starts a quiz; shows the open
 * question with a countdown on the server's clock, takes one answer, and after
 * the question closes shows whether it was right, the person's rank and the top 10.
 */
export default function LiveQuizPanel({ eventId }: { eventId: string }) {
  const c = useCosmos();
  const [feed, setFeed] = useState<QuizFeed | null>(null);
  // Server clock minus the phone's: the countdown follows the server.
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);

  const apply = useCallback((f: QuizFeed) => {
    setSkew(ms(f.serverNow) - Date.now());
    setFeed(f);
  }, []);

  const load = useCallback(async () => {
    const res = await getQuizFeed(eventId);
    if (res.ok) apply(res.data);
    else if (res.denied) setDenied(true);
  }, [eventId, apply]);

  useEffect(() => {
    void load();
  }, [load]);
  // Not confirmed for this event (unpaid, waitlisted): stop listening.
  useEngagementSocket(eventId, load, !denied);

  const q = feed?.quiz?.question ?? null;
  const ticking = !!q && !q.closed;

  // Tick the countdown while a question is open.
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ticking]);

  // Fetch the reveal when the server says it's due; no ping comes for a timer running out.
  const revealAt = ticking ? ms(q.revealAt) : 0;
  useEffect(() => {
    if (!revealAt) return;
    const wait = Math.max(0, revealAt - (Date.now() + skew)) + Math.random() * REVEAL_JITTER_MS;
    const t = setTimeout(() => void load(), wait);
    return () => clearTimeout(t);
  }, [revealAt, skew, load]);

  const quiz = feed?.quiz;
  if (!quiz) return null;

  const serverNow = now + skew;
  const opensIn = q ? Math.ceil((ms(q.openedAt) - serverNow) / 1000) : 0;
  const left = q ? Math.max(0, Math.ceil((ms(q.closesAt) - serverNow) / 1000)) : 0;
  const canAnswer = !!q && !q.closed && !q.myAnswer && opensIn <= 0 && left > 0 && !sending;

  const answer = async (optionIndex: number) => {
    if (!q) return;
    setSending(true);
    const res = await answerQuiz(eventId, quiz.id, q.id, optionIndex);
    setSending(false);
    if (res.ok) apply(res.data);
    else {
      void load(); // already answered, or time ran out: show what's true now
      AppAlert.alert("Couldn't answer", res.message);
    }
  };

  return (
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: c.mint }]} />
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]} numberOfLines={1}>
          {quiz.title}
        </Text>
        {q ? (
          <Text style={[styles.meta, { color: c.muted }]}>
            {q.position + 1} of {quiz.questionCount}
          </Text>
        ) : null}
      </View>

      {q ? (
        <View style={styles.question}>
          <Text
            style={[styles.clock, { color: q.closed ? c.muted : opensIn <= 0 && left <= 5 ? c.warn : c.mint }]}
            accessibilityLiveRegion="polite"
          >
            {q.closed ? "Time's up" : opensIn > 0 ? `Get ready… ${opensIn}` : `${left}s`}
          </Text>
          <Text style={[styles.prompt, { color: c.text }]}>{q.prompt}</Text>
          {q.options.map((o, i) => {
            const mine = q.myAnswer?.optionIndex === i;
            const right = !!q.correctIndexes?.includes(i);
            // The option is a control, so its outline stays monochrome; the result is the glyph and text.
            const border = mine ? c.primary : c.border;
            return (
              <Pressable
                key={i}
                disabled={!canAnswer}
                onPress={() => void answer(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: mine, disabled: !canAnswer }}
                accessibilityLabel={q.closed && right ? `${o}, right answer` : o}
                style={[styles.option, { borderColor: border, opacity: opensIn > 0 ? 0.5 : 1 }]}
              >
                <Text style={[styles.optionText, { color: q.closed && right ? c.success : c.text }]} numberOfLines={2}>
                  {o}
                </Text>
                {q.closed && right ? <CheckCircle size={18} color={c.success} weight="fill" /> : null}
                {q.closed && mine && !right ? <XCircle size={18} color={c.danger} weight="fill" /> : null}
              </Pressable>
            );
          })}
          <Text style={[styles.meta, { color: q.closed && q.myAnswer?.correct ? c.success : c.muted }]}>
            {q.closed
              ? q.myAnswer
                ? q.myAnswer.correct
                  ? `Right! +${q.myAnswer.points} points`
                  : 'Not this time.'
                : "You didn't answer this one."
              : q.myAnswer
                ? "Locked in. You'll see if it's right when time's up."
                : opensIn > 0
                  ? 'Read the question. Answers open in a moment.'
                  : quiz.speedBonus
                    ? 'One answer each. Faster right answers score more.'
                    : 'One answer each.'}
          </Text>
        </View>
      ) : null}

      <Board board={quiz.leaderboard} final={quiz.status === 'ENDED'} />
    </View>
  );
}

function Board({ board, final }: { board: Leaderboard; final: boolean }) {
  const c = useCosmos();
  if (!board.top.length) return null;
  const meShown = board.top.some((r) => r.isMe);
  return (
    <View style={styles.board}>
      <Text style={[styles.boardTitle, { color: c.text }]}>{final ? 'Final leaderboard' : 'Leaderboard'}</Text>
      {board.me ? (
        <Text style={[styles.meta, { color: c.soft }]}>
          You're #{board.me.rank} of {board.players} · {board.me.score} pts
        </Text>
      ) : null}
      {[...board.top, ...(board.me && !meShown ? [board.me] : [])].map((r, i) => (
        <View key={i} style={styles.row}>
          <Text style={[styles.rank, { color: c.muted }]}>{r.rank}</Text>
          <Text style={[styles.name, r.isMe && cosmosFont.strong, { color: c.text }]} numberOfLines={1}>
            {r.isMe ? `${r.name} (you)` : r.name}
          </Text>
          <Text style={[styles.score, { color: r.isMe ? c.mint : c.text }]}>{r.score}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, padding: spacing[5], marginTop: spacing[6], gap: spacing[4] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  title: { flex: 1, fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  question: { gap: spacing[2] },
  clock: { fontSize: typography.fontSize['2xl'], lineHeight: 30, ...cosmosFont.figure },
  prompt: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.strong },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderRadius: cosmosRadius,
  },
  optionText: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  board: { gap: spacing[1] },
  boardTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 32 },
  rank: { width: 24, fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  name: { flex: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  score: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
});
