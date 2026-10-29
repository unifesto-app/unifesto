import { useCallback, useEffect, useRef, useState } from 'react';
import { getCategories, getEvents, type Event } from '../lib/api/events';
import { weekendWindow } from '../utils/eventFormat';

const PAGE_SIZE = 20;
const ALL = 'All';

type LoadMode = 'initial' | 'refresh' | 'more';

/** Quick filters that sit before the category chips (and that Home's "Browse by" row links to). */
export const PRESETS = [
  { key: 'weekend', label: 'This weekend' },
  { key: 'free', label: 'Free' },
  { key: 'online', label: 'Online' },
] as const;
export type Preset = (typeof PRESETS)[number]['key'];

const isPreset = (v?: string): v is Preset => PRESETS.some((p) => p.key === v);

function presetParams(preset: Preset | null) {
  if (preset === 'online') return { type: 'ONLINE' as const };
  if (preset === 'free') return { free: true };
  if (preset === 'weekend') {
    const { start, end } = weekendWindow();
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  return {};
}

/**
 * Data for the Events browse list: category chips, debounced search and
 * paged results. Every request carries a sequence number so a slow response
 * for an old query/category can never overwrite a newer one.
 */
export function useEventsBrowse(initial: {
  category?: string;
  search?: string;
  preset?: string;
  /** K1: browse one city, or one college or club (Home's "near you" and space links). */
  city?: string;
  spaceId?: string;
  spaceName?: string;
}) {
  const [categories, setCategories] = useState<string[]>([ALL]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [category, setCategory] = useState(initial.category || ALL);
  const [preset, setPreset] = useState<Preset | null>(isPreset(initial.preset) ? initial.preset : null);
  const [city, setCity] = useState(initial.city || '');
  const [space, setSpace] = useState(initial.spaceId ? { id: initial.spaceId, name: initial.spaceName || 'This space' } : null);
  const [query, setQuery] = useState(initial.search || '');
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());

  const [events, setEvents] = useState<Event[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    getCategories()
      .then((cats: { name: string }[]) => setCategories([ALL, ...cats.map((c) => c.name)]))
      .catch(() => {})
      .finally(() => setCategoriesLoading(false));
  }, []);

  // Debounce typing; clearing the field applies immediately.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(q), 400);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback(
    async (pageNum: number, mode: LoadMode) => {
      const id = ++seq.current;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'more') setLoadingMore(true);
      else setLoading(true);
      setError(false);

      try {
        const res = await getEvents({
          page: pageNum,
          limit: PAGE_SIZE,
          status: 'PUBLISHED',
          ...(category !== ALL ? { category } : {}),
          ...(city ? { city } : {}),
          ...(space ? { spaceId: space.id } : {}),
          ...presetParams(preset),
          ...(debouncedQuery ? { search: debouncedQuery } : {}),
        } as any);
        if (id !== seq.current) return; // a newer request superseded this one
        const list: Event[] = res?.events || res?.data || [];
        setEvents((prev) => (pageNum === 1 ? list : [...prev, ...list]));
        setHasMore(list.length === PAGE_SIZE);
        setPage(pageNum);
      } catch {
        if (id === seq.current) setError(true);
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [category, city, space, preset, debouncedQuery],
  );

  useEffect(() => {
    void fetchPage(1, 'initial');
  }, [fetchPage]);

  const refresh = useCallback(() => void fetchPage(1, 'refresh'), [fetchPage]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && !refreshing && hasMore && events.length > 0) void fetchPage(page + 1, 'more');
  }, [loading, loadingMore, refreshing, hasMore, events.length, page, fetchPage]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setCategory(ALL);
    setPreset(null);
    setCity('');
    setSpace(null);
  }, []);

  return {
    categories,
    categoriesLoading,
    category,
    setCategory,
    preset,
    setPreset,
    city,
    clearCity: () => setCity(''),
    space,
    clearSpace: () => setSpace(null),
    query,
    setQuery,
    filtered: category !== ALL || !!preset || !!debouncedQuery || !!city || !!space,
    events,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh,
    loadMore,
    clearFilters,
  };
}
