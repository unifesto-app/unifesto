import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getCheckinStats, getRecentCheckins, type CheckinStats, type RecentCheckin } from '../lib/api/checkin';
import { getTransactions } from '../lib/api/transactions';
import { getHelpInbox, type HelpInboxQuery } from '../lib/api/hackathon';
import { listSpaceDesk, type SupportTicket } from '../lib/api/support';

const CHECKIN_EVERY = 15_000;
const DESK_EVERY = 30_000;
const MONEY_EVERY = 120_000;
const CAPTURED = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);

export interface TodayMoney {
  collected: number;
  payments: number;
}

/** What's waiting at the help desk: a hackathon's team queries, else this event's open Assist cases. */
export type DeskQueue =
  | { kind: 'hackathon'; open: HelpInboxQuery[] }
  | { kind: 'space'; open: SupportTicket[] };

/** Runs `fn` now and every `ms` while the screen is focused. */
function usePoll(fn: () => Promise<void>, ms: number) {
  useFocusEffect(
    useCallback(() => {
      void fn();
      const t = setInterval(() => void fn(), ms);
      return () => clearInterval(t);
    }, [fn, ms]),
  );
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * The event-day cockpit's live numbers, each refreshed on its own clock while
 * the screen is open: check-ins every 15s, the help desk every 30s, money every
 * 2 min. A section the user can't see (403) stays null and the screen hides it.
 */
export function useEventDay(eventId: string, spaceId: string | undefined, opts: { money: boolean }) {
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [recent, setRecent] = useState<RecentCheckin[]>([]);
  const [today, setToday] = useState<TodayMoney | null>(null);
  const [desk, setDesk] = useState<DeskQueue | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadCheckins = useCallback(async () => {
    const [s, r] = await Promise.allSettled([getCheckinStats(eventId), getRecentCheckins(eventId, 5)]);
    if (s.status === 'fulfilled') setStats(s.value);
    if (r.status === 'fulfilled') setRecent(r.value);
    setUpdatedAt(new Date());
  }, [eventId]);

  // ponytail: pages every registration and filters on paidAt here; add a
  // server-side ?paidSince= if big events make this slow.
  const loadMoney = useCallback(async () => {
    if (!opts.money) return;
    const res = await getTransactions(eventId);
    if (!res.ok) return;
    const since = startOfToday();
    // Captured payments only (a later refund still counts as collected, like the Transactions tiles).
    const paid = res.data.filter((r) => CAPTURED.has(r.paymentStatus) && r.paidAt && new Date(r.paidAt).getTime() >= since);
    setToday({ collected: paid.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0), payments: paid.length });
  }, [eventId, opts.money]);

  const loadDesk = useCallback(async () => {
    const inbox = await getHelpInbox(eventId);
    if (inbox.ok && inbox.data) {
      setDesk({ kind: 'hackathon', open: inbox.data.queries.filter((q) => q.status !== 'RESOLVED') });
      return;
    }
    if (!spaceId) return;
    // The space desk has no event filter; its open cases are few, so filter here.
    const cases = await listSpaceDesk(spaceId, { status: 'OPEN' });
    if (cases.ok) setDesk({ kind: 'space', open: cases.data.tickets.filter((t) => t.eventId === eventId) });
  }, [eventId, spaceId]);

  usePoll(loadCheckins, CHECKIN_EVERY);
  usePoll(loadDesk, DESK_EVERY);
  usePoll(loadMoney, MONEY_EVERY);

  const refresh = useCallback(async () => {
    await Promise.all([loadCheckins(), loadDesk(), loadMoney()]);
  }, [loadCheckins, loadDesk, loadMoney]);

  return { stats, recent, today, desk, updatedAt, refresh };
}
