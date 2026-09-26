import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { getEventById, type Event } from '../lib/api/events';
import { getCheckinStats, type CheckinStats } from '../lib/api/checkin';
import { getAttendeeStats, type AttendeeStats } from '../lib/api/manageEvent';
import { HOSTING_ROLE_CODES } from '../lib/spaceSections';

/**
 * Everything the event hub needs: the event, headcounts, live check-in progress
 * and which tools this user may use here. Permissions are read from data the
 * Space tab already loaded (plus whether the stats call was allowed), so the
 * hub never shows a button the server would reject.
 */
export function useManageEvent(eventId: string | undefined) {
  const { spaces, checkinEvents, judgingEvents } = useSpaceAccess();

  const [event, setEvent] = useState<Event | null>(null);
  const [attendeeStats, setAttendeeStats] = useState<AttendeeStats | null>(null);
  const [attendeesDenied, setAttendeesDenied] = useState(false);
  const [checkin, setCheckin] = useState<CheckinStats | null>(null);
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
    const space = spaces.find((s) => s.id === event?.spaceId);
    const isSpaceAdmin = space?.userRole?.code === 'SPACE_ADMIN';
    const eventRole = space?.eventAccess.find((a) => a.eventId === eventId)?.roleCode;
    const hosts = isSpaceAdmin || (!!eventRole && (HOSTING_ROLE_CODES as readonly string[]).includes(eventRole));
    return {
      /** Curator-level tools (edit, content, WhatsApp, settings). The server re-checks. */
      hosts,
      /** Money (payouts) is Space-Admin only, and only for the owning space. */
      canPayout: isSpaceAdmin,
      /** Sponsors are space:manage-sponsors — Space Admins of the owning space. */
      canSponsors: isSpaceAdmin,
      canViewAttendees: !attendeesDenied,
      canScan: checkinEvents.some((e) => e.id === eventId),
      canJudge: judgingEvents.some((j) => j.eventId === eventId),
    };
  }, [spaces, event?.spaceId, eventId, attendeesDenied, checkinEvents, judgingEvents]);

  return { event, attendeeStats, checkin, access, loading, refreshing, error, refresh, retry: load };
}
