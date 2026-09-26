import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Result } from '../lib/api/manageEvent';

export interface Page<T> {
  items: T[];
  /** Whether another page exists after this one. */
  hasMore: boolean;
}

/**
 * Paged list state for Apex consoles: first page on focus (so a campaign sent
 * from a pushed screen shows up on return), pull-to-refresh, infinite scroll.
 * A new first page supersedes anything still in flight.
 */
export default function usePagedList<T>(fetchPage: (page: number) => Promise<Result<Page<T>>>) {
  const [rows, setRows] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(
    async (next: number) => {
      const gen = next === 1 ? ++generation.current : generation.current;
      const res = await fetchPage(next);
      if (gen !== generation.current) return;
      if (!res.ok) {
        setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
        return;
      }
      setError('');
      setPage(next);
      setHasMore(res.data.hasMore);
      setRows((prev) => (next === 1 ? res.data.items : [...prev, ...res.data.items]));
    },
    [fetchPage],
  );

  useFocusEffect(
    useCallback(() => {
      void load(1).finally(() => setLoading(false));
    }, [load]),
  );

  const reload = useCallback(() => load(1), [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    await load(page + 1);
    setLoadingMore(false);
  };

  return { rows, loading, loadingMore, refreshing, error, refresh, reload, loadMore };
}
