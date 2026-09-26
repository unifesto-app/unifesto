import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getEventById } from '../lib/api/events';
import {
  getManageTicketTypes,
  reorderTicketTypes,
  type ManagedTicketType,
  type TicketFormField,
} from '../lib/api/ticketTypes';

/**
 * An event's ticket types, split into paid/group tickets and one-click RSVPs.
 * Reloads whenever the screen regains focus, so coming back from the editor
 * always shows the saved state.
 *
 * Tiers come from the operator endpoint (hidden ones included, with stats);
 * registration questions from the event payload, which isn't filtered.
 */
export function useEventTicketTypes(eventId: string | undefined) {
  const [all, setAll] = useState<ManagedTicketType[]>([]);
  const [formFields, setFormFields] = useState<TicketFormField[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!eventId) return;
    const gen = ++generation.current;
    const [res, event] = await Promise.all([getManageTicketTypes(eventId), getEventById(eventId)]);
    if (gen !== generation.current) return;
    if (!res.ok) {
      setError(res.denied ? "You can't manage tickets for this event." : res.message);
    } else {
      // Server already orders them; keep the sort as a guard for stale caches.
      const types = res.data.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setAll(types);
      setCurrency(types[0]?.currency ?? 'INR');
      setFormFields(((event as unknown as { formFields?: TicketFormField[] } | null)?.formFields ?? []).slice());
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

  /**
   * Swap a tier with its neighbour among `list` (tickets or RSVPs). The swap
   * happens in the full list, so the other kind keeps its slots, and the whole
   * order is sent because the API wants every id.
   */
  const move = useCallback(
    async (list: ManagedTicketType[], id: string, dir: -1 | 1) => {
      if (!eventId) return;
      const i = list.findIndex((t) => t.id === id);
      const neighbour = list[i + dir];
      if (i < 0 || !neighbour) return;
      const next = all.slice();
      const a = next.findIndex((t) => t.id === id);
      const b = next.findIndex((t) => t.id === neighbour.id);
      [next[a], next[b]] = [next[b], next[a]];
      setAll(next);
      const res = await reorderTicketTypes(eventId, next.map((t) => t.id));
      if (!res.ok) {
        setError(res.message);
        await load();
      }
    },
    [eventId, all, load],
  );

  const fieldsFor = useCallback(
    (ticketTypeId: string) => formFields.filter((f) => f.ticketTypeId === ticketTypeId).sort((a, b) => a.order - b.order),
    [formFields],
  );

  return { ...split, all, formFields, fieldsFor, currency, loading, refreshing, error, refresh, reload: load, move };
}
