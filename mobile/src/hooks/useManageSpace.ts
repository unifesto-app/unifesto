import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { getManagedSpaceEvents, getSpaceTeam, type ManagedEvent, type SpaceTeamMember } from '../lib/api/manageSpace';
import type { OperatorSpace } from '../lib/api/spaceAccess';

export type ManageTab = 'upcoming' | 'drafts' | 'past';

const time = (iso: string) => new Date(iso).getTime();

/**
 * Splits a space's events into the three tabs.
 *   upcoming: not a draft, not cancelled, hasn't ended (live events included), soonest first
 *   drafts:   unfinished work only the operator can move forward, last touched first
 *   past:     ended or cancelled, most recent first
 */
export function bucketEvents(events: ManagedEvent[], now: Date): Record<ManageTab, ManagedEvent[]> {
  const n = now.getTime();
  const upcoming: ManagedEvent[] = [];
  const drafts: ManagedEvent[] = [];
  const past: ManagedEvent[] = [];
  for (const e of events) {
    if (e.status === 'DRAFT') drafts.push(e);
    else if (e.status === 'CANCELLED' || time(e.endDateTime) < n) past.push(e);
    else upcoming.push(e);
  }
  upcoming.sort((a, b) => time(a.startDateTime) - time(b.startDateTime));
  drafts.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  past.sort((a, b) => time(b.startDateTime) - time(a.startDateTime));
  return { upcoming, drafts, past };
}

/** Space Admins see every event; event-scoped Curators/Co-Curators only their own. */
function visibleTo(space: OperatorSpace | undefined, events: ManagedEvent[]): ManagedEvent[] {
  if (!space || space.userRole?.code === 'SPACE_ADMIN') return events;
  const mine = new Set(space.eventAccess.map((e) => e.eventId));
  return events.filter((e) => mine.has(e.id));
}

export function useManageSpace(spaceId: string | undefined) {
  const { spaces } = useSpaceAccess();
  const space = spaces.find((s) => s.id === spaceId);

  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [team, setTeam] = useState<{ total: number; members: SpaceTeamMember[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<ManageTab>('upcoming');
  // Ignores a slow response for a space the user already navigated away from.
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!spaceId) return;
    const gen = ++generation.current;
    setError('');
    try {
      const [list, members] = await Promise.all([getManagedSpaceEvents(spaceId), getSpaceTeam(spaceId)]);
      if (gen !== generation.current) return;
      setEvents(list);
      setTeam(members);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : 'Could not load this space');
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const buckets = useMemo(() => bucketEvents(visibleTo(space, events), new Date()), [space, events]);

  const stats = useMemo(
    () => ({
      upcoming: buckets.upcoming.length,
      attending: buckets.upcoming.reduce((sum, e) => sum + (e.attendees?.total ?? 0), 0),
      drafts: buckets.drafts.length,
    }),
    [buckets],
  );

  return { space, buckets, stats, team, tab, setTab, loading, refreshing, error, refresh, retry: load };
}
