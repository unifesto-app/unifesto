import { useCallback, useEffect, useRef, useState } from 'react';
import { getAttendees, type AttendeeFilter, type AttendeeRow } from '../lib/api/manageEvent';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Paged, searchable attendee list for one event: one page of PAGE_SIZE at a
 * time, with numbered navigation. Search is debounced and every request carries
 * a generation number, so a slow response for an old query or page can never
 * overwrite the rows for what the user is looking at now. A new search or tab
 * starts again from page 1.
 */
export function useEventAttendees(eventId: string | undefined) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<AttendeeFilter>('attending');
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback(
    async (target: number) => {
      if (!eventId) return;
      const gen = ++generation.current;
      const res = await getAttendees(eventId, { page: target, search: debounced, filter, limit: PAGE_SIZE });
      if (gen !== generation.current) return;
      if (!res.ok) {
        setDenied(res.denied);
        setError(res.message);
        return;
      }
      setError('');
      setTotal(res.data.total ?? 0);
      setPage(target);
      setRows(res.data.registrations);
    },
    [eventId, debounced, filter],
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(1).finally(() => setLoading(false));
  }, [fetchPage]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = useCallback(
    async (target: number) => {
      const next = Math.min(Math.max(1, target), pageCount);
      if (next === page || paging) return;
      setPaging(true);
      await fetchPage(next);
      setPaging(false);
    },
    [page, pageCount, paging, fetchPage],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(page);
    setRefreshing(false);
  }, [fetchPage, page]);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    rows,
    total,
    page,
    pageCount,
    /** 1-based position of this page's first and last row, for "31–60 of 245". */
    from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
    to: Math.min(page * PAGE_SIZE, total),
    goToPage,
    loading,
    paging,
    refreshing,
    error,
    denied,
    refresh,
  };
}
