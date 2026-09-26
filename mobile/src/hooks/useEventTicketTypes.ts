import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getEventById } from '../lib/api/events';
import type { ManagedTicketType } from '../lib/api/ticketTypes';

/**
 * An event's ticket types, split into paid/group tickets and one-click RSVPs.
 * Reloads whenever the screen regains focus, so coming back from the editor
 * always shows the saved state.
 *
 * Note: the event endpoint only returns visible + active types, so mobile never
 * offers a hide/deactivate toggle — a hidden type would vanish from this list.
 */
export function useEventTicketTypes(eventId: string | undefined) {
  const [all, setAll] = useState<ManagedTicketType[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!eventId) return;
    const gen = ++generation.current;
    const event = await getEventById(eventId);
    if (gen !== generation.current) return;
    if (!event) {
      setError('Could not load tickets');
    } else {
      const types = ((event as unknown as { ticketTypes?: ManagedTicketType[] }).ticketTypes ?? []).slice();
      types.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setAll(types);
      setCurrency(types[0]?.currency ?? 'INR');
      setError('');
    }
    setLoading(false);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    setLoading(true);
  }, [eventId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const split = useMemo(
    () => ({
      tickets: all.filter((t) => t.kind === 'INDIVIDUAL' || t.kind === 'GROUP'),
      rsvps: all.filter((t) => t.kind === 'RSVP'),
    }),
    [all],
  );

  return { ...split, all, currency, loading, refreshing, error, refresh, reload: load };
}
