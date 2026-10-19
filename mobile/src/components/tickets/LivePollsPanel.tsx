import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle } from '@unifesto/unicon/react-native';
import { useEngagementSocket } from '../../hooks/useHackathonSocket';
import { getPollFeed, votePoll, type FeedPoll } from '../../lib/api/polls';
import { AppAlert } from '../ui/AppAlert';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

/** Older closed polls drop off; the panel is about the room right now. */
const MAX_SHOWN = 3;

/**
 * L1: the event's live polls on the attendee's ticket. Mount it only while the
 * event is on. Renders nothing until an organiser launches a poll; votes once,
 * then shows the counts when the organiser allows it.
 */
export default function LivePollsPanel({ eventId }: { eventId: string }) {
  const c = useCosmos();
  const [polls, setPolls] = useState<FeedPoll[]>([]);
  const [voting, setVoting] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const res = await getPollFeed(eventId);
    if (res.ok) setPolls(res.data.polls);
    else if (res.denied) setDenied(true);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);
  // Not confirmed for this event (unpaid, waitlisted): stop listening.
  useEngagementSocket(eventId, load, !denied);

  const vote = async (poll: FeedPoll, optionIndex: number) => {
    setVoting(poll.id);
    const res = await votePoll(eventId, poll.id, optionIndex);
    setVoting(null);
    if (res.ok) setPolls(res.data.polls);
    else {
      void load(); // already voted elsewhere, or it just closed: show what's true now
      AppAlert.alert("Couldn't vote", res.message);
    }
  };

  // Live ones, plus closed ones with results to show.
  const shown = polls.filter((p) => p.status === 'LIVE' || p.results).slice(0, MAX_SHOWN);
  if (!shown.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.raised }]}>
      <Text style={[styles.title, { color: c.text }]}>Live polls</Text>
      {shown.map((p) => {
        const open = p.status === 'LIVE' && p.myVote === null;
        const total = p.totalVotes ?? 0;
        return (
          <View key={p.id} style={styles.poll}>
            <Text style={[styles.question, { color: c.text }]}>{p.question}</Text>
            {p.options.map((o, i) => {
              const n = p.results?.[i] ?? 0;
              const pct = p.results && total ? Math.round((n / total) * 100) : null;
              const mine = p.myVote === i;
              return (
                <Pressable
                  key={i}
                  disabled={!open || voting === p.id}
                  onPress={() => void vote(p, i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mine, disabled: !open }}
                  accessibilityLabel={pct !== null ? `${o}, ${pct} percent` : o}
                  style={[styles.option, { borderColor: mine ? c.primary : c.border }]}
                >
                  {pct !== null ? (
                    <View style={[styles.bar, { width: `${pct}%`, backgroundColor: c.tint }]} />
                  ) : null}
                  <Text style={[styles.optionText, { color: c.text }]} numberOfLines={2}>
                    {o}
                  </Text>
                  {mine ? <CheckCircle size={18} color={c.primary} weight="fill" /> : null}
                  {pct !== null ? <Text style={[styles.pct, { color: c.soft }]}>{pct}%</Text> : null}
                </Pressable>
              );
            })}
            <Text style={[styles.meta, { color: c.muted }]}>
              {p.status === 'CLOSED'
                ? `Final results · ${total} vote${total === 1 ? '' : 's'}`
                : p.myVote === null
                  ? 'Tap an option to vote. One vote each.'
                  : p.results
                    ? `${total} vote${total === 1 ? '' : 's'} so far`
                    : 'Thanks for voting. Results come when the poll closes.'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, padding: spacing[5], marginTop: spacing[6], gap: spacing[5] },
  title: { fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  poll: { gap: spacing[2] },
  question: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.strong },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  optionText: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  pct: { fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
