import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getEventStays, rupees, STATUS_LABELS, type EventStays } from '../lib/api/stays';

export interface StaySummary {
  /** Row label, e.g. "Stay near the venue". */
  label: string;
  /** Right-hand value: the guest's status, or the cheapest price. */
  value?: string;
  /** Where the row goes. */
  href: string;
}

/**
 * Whether an event offers Unifesto Stay, summarised for a single row on the
 * event page or a ticket. Null while loading, when signed out, or when the
 * event has no published stays and the user has no stay of their own.
 */
export function useEventStays(eventId: string | undefined | null, enabled = true): StaySummary | null {
  const [data, setData] = useState<EventStays | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!eventId || !enabled) return;
      let live = true;
      void getEventStays(eventId).then((r) => {
        if (live) setData(r.ok ? r.data : null);
      });
      return () => {
        live = false;
      };
    }, [eventId, enabled]),
  );

  if (!data || !eventId) return null;
  if (data.myBooking) {
    return { label: 'Your stay', value: STATUS_LABELS[data.myBooking.status], href: `/stay/pass/${data.myBooking.id}` };
  }
  if (!data.stays.length) return null;
  const prices = data.stays.flatMap((s) => s.options.map((o) => o.price));
  const cheapest = Math.min(...prices);
  return {
    label: 'Stay near the venue',
    value: cheapest === 0 ? 'Free options' : `From ${rupees(cheapest)}`,
    href: `/stay/${eventId}`,
  };
}
