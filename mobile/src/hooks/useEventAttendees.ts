import { useCallback, useEffect, useRef, useState } from 'react';
import { getAttendees, type AttendeeFilter, type AttendeeRow } from '../lib/api/manageEvent';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Paged, searchable attendee list for one event. Search is debounced and every
 * request carries a generation number, so a slow response for an old query can
 * never overwrite the rows for what the user is typing now.
 */
export function useEventAttendees(eventId: string | undefined, ticketTypeId?: string) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<AttendeeFilter>('attending');
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!eventId) return;
      const gen = nextPage === 1 ? ++generation.current : generation.current;
      const res = await getAttendees(eventId, { page: nextPage, search: debounced, filter, limit: PAGE_SIZE, ticketTypeId });
      if (gen !== generation.current) return;
      if (!res.ok) {
        setDenied(res.denied);
        setError(res.message);
        return;
      }
      setError('');
      setTotal(res.data.total ?? 0);
      setPage(nextPage);
      setRows((prev) => (nextPage === 1 ? res.data.registrations : [...prev, ...res.data.registrations]));
    },
    [eventId, debounced, filter, ticketTypeId],
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(1).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || rows.length >= total) return;
    setLoadingMore(true);
    await fetchPage(page + 1);
    setLoadingMore(false);
  }, [loading, loadingMore, rows.length, total, fetchPage, page]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(1);
    setRefreshing(false);
  }, [fetchPage]);

  return { query, setQuery, filter, setFilter, rows, total, loading, loadingMore, refreshing, error, denied, loadMore, refresh };
}
