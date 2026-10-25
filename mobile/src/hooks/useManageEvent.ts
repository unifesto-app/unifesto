import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { getEventById, type Event } from '../lib/api/events';
import { getCheckinStats, type CheckinStats } from '../lib/api/checkin';
import { getAttendeeStats, getSpaceAccess, type AttendeeStats, type SpaceAccess } from '../lib/api/manageEvent';

/**
 * Everything the event hub needs: the event, headcounts, live check-in progress
 * and which tools this user may use here. Permissions come from the backend's
 * effective capabilities for this event (GET /spaces/:id/access), so the hub
 * never shows a button the server would reject.
 */
export function useManageEvent(eventId: string | undefined) {
  const { judgingEvents } = useSpaceAccess();

  const [event, setEvent] = useState<Event | null>(null);
  const [attendeeStats, setAttendeeStats] = useState<AttendeeStats | null>(null);
  const [attendeesDenied, setAttendeesDenied] = useState(false);
  const [checkin, setCheckin] = useState<CheckinStats | null>(null);
  const [caps, setCaps] = useState<SpaceAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!eventId) return;
    const gen = ++generation.current;
    setError('');
    const [ev, stats, live] = await Promise.all([
      getEventById(eventId),
      getAttendeeStats(eventId),
      getCheckinStats(eventId).catch(() => null),
    ]);
    if (gen !== generation.current) return;
    if (!ev) {
      setError('Could not load this event');
    } else {
      setEvent(ev);
      setAttendeeStats(stats.ok ? stats.data : null);
      setAttendeesDenied(!stats.ok && stats.denied);
      setCheckin(live);
      const acc = await getSpaceAccess(ev.spaceId, eventId);
      if (gen !== generation.current) return;
      setCaps(acc.ok ? acc.data : null);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    setLoading(true);
  }, [eventId]);

  // Reload on every focus, so counts are fresh after editing tickets or restoring someone.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const access = useMemo(() => {
    const can = (action: string) => !!caps?.capabilities.includes(action);
    const feature = (key: string) => !!caps && (!caps.plan || !!caps.plan.features[key]);
    return {
      /** Curator-level tools (edit, content, WhatsApp, settings). The server re-checks. */
      hosts: can('event:edit'),
      canPublish: can('event:publish'),
      /** Payouts: event money (Curator) or space money (Space Admin). */
      canPayout: can('event:manage-money') || can('space:manage-money'),
      canSponsors: can('space:manage-sponsors') && feature('hasSponsors'),
      canViewAttendees: !attendeesDenied,
      canScan: can('event:check-in'),
      canJudge: judgingEvents.some((j) => j.eventId === eventId),
    };
  }, [caps, eventId, attendeesDenied, judgingEvents]);

  return { event, attendeeStats, checkin, access, loading, refreshing, error, refresh, retry: load };
}
