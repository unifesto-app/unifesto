import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  changeSpaceMemberRole,
  getSpaceMembers,
  removeSpaceMember,
  type SpaceMember,
  type SpaceMemberRole,
} from '../lib/api/spaceMembers';

export type MemberFilter = 'all' | SpaceMemberRole;

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * A space's roster: debounced search, role filter, paging, plus role change and
 * removal. Mutations update the loaded rows in place (no full reload), and
 * every fetch carries a generation number so a slow old response can't
 * overwrite a newer one.
 */
export function useSpaceMembers(spaceId: string | undefined) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [rows, setRows] = useState<SpaceMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  /** Membership id with a mutation in flight (drives the row spinner). */
  const [busyId, setBusyId] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!spaceId) return;
      const gen = nextPage === 1 ? ++generation.current : generation.current;
      const res = await getSpaceMembers(spaceId, {
        page: nextPage,
        search: debounced,
        role: filter === 'all' ? undefined : filter,
        limit: PAGE_SIZE,
      });
      if (gen !== generation.current) return;
      if (!res.ok) {
        setDenied(res.denied);
        setError(res.message);
        return;
      }
      setError('');
      setDenied(false);
      setTotal(res.data.pagination?.total ?? 0);
      setPage(nextPage);
      setRows((prev) => (nextPage === 1 ? res.data.members : [...prev, ...res.data.members]));
    },
    [spaceId, debounced, filter],
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(1).finally(() => setLoading(false));
  }, [fetchPage]);

  // Coming back from "Add member" should show the new person.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void fetchPage(1);
    }, [fetchPage]),
  );

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

  const changeRole = useCallback(
    async (member: SpaceMember, role: SpaceMemberRole): Promise<string | null> => {
      if (!spaceId) return 'Missing space';
      setBusyId(member.id);
      const res = await changeSpaceMemberRole(spaceId, member.id, role);
      setBusyId(null);
      if (!res.ok) return res.message;
      const updated = res.data.member;
      // Under a role filter, someone moved to the other role leaves this view.
      if (filter !== 'all' && filter !== role) {
        setRows((prev) => prev.filter((m) => m.id !== member.id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setRows((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)));
      }
      return null;
    },
    [spaceId, filter],
  );

  const remove = useCallback(
    async (member: SpaceMember): Promise<string | null> => {
      if (!spaceId) return 'Missing space';
      setBusyId(member.id);
      const res = await removeSpaceMember(spaceId, member.id);
      setBusyId(null);
      if (!res.ok) return res.message;
      setRows((prev) => prev.filter((m) => m.id !== member.id));
      setTotal((t) => Math.max(0, t - 1));
      return null;
    },
    [spaceId],
  );

  return {
    query, setQuery, filter, setFilter,
    rows, total, loading, loadingMore, refreshing, error, denied, busyId,
    loadMore, refresh, changeRole, remove,
  };
}
