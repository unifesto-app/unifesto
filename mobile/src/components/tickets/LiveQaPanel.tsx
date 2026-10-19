import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CaretUp } from '@unifesto/unicon/react-native';
import { useEngagementSocket } from '../../hooks/useHackathonSocket';
import { askQuestion, getQaFeed, upvoteQuestion, type QaBoard, type Question } from '../../lib/api/questions';
import { Button } from '../ui';
import { AppAlert } from '../ui/AppAlert';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

/** The top of the board; the rest is a scroll away on the projector (L4). */
const MAX_SHOWN = 10;

/**
 * L2: live Q&A on the attendee's ticket, beside L1's polls in the same
 * engagement room. Mount it only while the event is on. Ask, upvote once each,
 * see approved questions by votes; your own waiting ones show only to you.
 */
export default function LiveQaPanel({ eventId }: { eventId: string }) {
  const c = useCosmos();
  const [board, setBoard] = useState<QaBoard | null>(null);
  const [denied, setDenied] = useState(false);
  const [agendaId, setAgendaId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getQaFeed(eventId, agendaId);
    if (res.ok) setBoard(res.data);
    else if (res.denied) setDenied(true);
  }, [eventId, agendaId]);

  useEffect(() => {
    void load();
  }, [load]);
  // ponytail: a second socket next to LivePollsPanel's; share one per event if quizzes (L3) add a third.
  useEngagementSocket(eventId, load, !denied);

  const ask = async () => {
    setSending(true);
    const res = await askQuestion(eventId, text.trim(), agendaId);
    setSending(false);
    if (!res.ok) return AppAlert.alert("Couldn't send", res.message);
    setText('');
    if (res.data.status === 'PENDING') {
      AppAlert.alert('Sent', 'Everyone sees it once a moderator approves it.');
    }
    void load();
  };

  const vote = async (q: Question) => {
    setVoting(q.id);
    // Optimistic: the count moves under the thumb, the refetch settles it.
    setBoard((b) => b && { ...b, questions: b.questions.map((x) => (x.id === q.id ? { ...x, voted: !q.voted, votes: x.votes + (q.voted ? -1 : 1) } : x)) });
    const res = await upvoteQuestion(eventId, q.id, !q.voted);
    setVoting(null);
    if (!res.ok) AppAlert.alert("Couldn't vote", res.message);
    void load();
  };

  if (denied || !board) return null;
  const shown = board.questions.slice(0, MAX_SHOWN);
  const canSend = text.trim().length >= 3 && !sending;

  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <Text style={[styles.title, { color: c.text }]}>Q&A</Text>

      {board.sessions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[{ id: null, title: 'All sessions' }, ...board.sessions].map((s) => {
            const on = agendaId === s.id;
            return (
              <Pressable
                key={s.id ?? 'all'}
                onPress={() => setAgendaId(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.tint : 'transparent' }]}
              >
                <Text style={[styles.chipText, { color: on ? c.text : c.soft }]} numberOfLines={1}>
                  {s.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.askRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={agendaId ? 'Ask about this session' : 'Ask a question'}
          placeholderTextColor={c.muted}
          maxLength={500}
          multiline
          accessibilityLabel="Your question"
          style={[styles.input, { color: c.text, borderColor: c.input }]}
        />
        <Button label="Ask" size="sm" disabled={!canSend} loading={sending} onPress={() => void ask()} />
      </View>

      {shown.length ? (
        shown.map((q) => (
          <View key={q.id} style={styles.row}>
            <Pressable
              disabled={q.status !== 'APPROVED' || voting === q.id}
              onPress={() => void vote(q)}
              accessibilityRole="button"
              accessibilityState={{ selected: q.voted, disabled: q.status !== 'APPROVED' }}
              accessibilityLabel={`${q.votes} upvotes${q.voted ? ', you upvoted' : ''}`}
              hitSlop={8}
              style={[styles.vote, { borderColor: q.voted ? c.primary : c.border, backgroundColor: q.voted ? c.tint : 'transparent' }]}
            >
              <CaretUp size={16} color={q.voted ? c.primary : c.soft} weight={q.voted ? 'fill' : 'bold'} />
              <Text style={[styles.voteCount, { color: c.text }]}>{q.votes}</Text>
            </Pressable>
            <View style={styles.body}>
              <Text style={[styles.question, { color: c.text }]}>{q.text}</Text>
              <Text style={[styles.meta, { color: c.muted }]}>
                {[
                  q.pinned ? 'Pinned' : null,
                  q.status === 'ANSWERED' ? 'Answered' : null,
                  q.status === 'PENDING' ? 'Waiting for approval, only you see this' : null,
                  q.mine ? 'You' : q.author,
                  agendaId ? null : q.agendaTitle,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={[styles.meta, { color: c.muted }]}>No questions yet. Ask the first one.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, padding: spacing[5], marginTop: spacing[6], gap: spacing[4] },
  title: { fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  chips: { gap: spacing[2] },
  chip: { borderWidth: 1, borderRadius: borderRadius.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1] + 2, maxWidth: 220 },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  askRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: cosmosRadius,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    fontSize: typography.fontSize.base,
    ...cosmosFont.body,
  },
  row: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  vote: { width: 44, minHeight: 44, borderWidth: 1, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  voteCount: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  body: { flex: 1, gap: spacing[1] },
  question: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
