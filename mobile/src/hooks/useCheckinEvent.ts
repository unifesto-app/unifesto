import { useEffect, useState } from 'react';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { getMyCheckinEvents, type CheckinEvent, type CheckinPoint } from '../lib/api/checkin';

/**
 * The check-in event (and the points this user may work at it). Reads the
 * Space-access cache first so the hub, scanner and manual screens open
 * instantly; falls back to a fetch when the event isn't cached yet (deep
 * link, cold start).
 */
export function useCheckinEvent(eventId: string) {
  const { checkinEvents } = useSpaceAccess();
  const cached = checkinEvents.find((e) => e.id === eventId) ?? null;
  const [fetched, setFetched] = useState<CheckinEvent | null>(null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    getMyCheckinEvents()
      .then(({ events }) => alive && setFetched(events.find((e) => e.id === eventId) ?? null))
      .catch(() => alive && setFetched(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId, cached]);

  const event = cached ?? fetched;
  const points: CheckinPoint[] = event?.checkinTypes ?? [];
  return { event, points, loading };
}
