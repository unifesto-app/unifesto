import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getEvents, type Event } from '../lib/api/events';
import { getAllSpaces } from '../lib/api/spaces';

// Persisted search history (survives app restarts) and how many terms we keep.
const RECENT_SEARCHES_KEY = 'unifesto:recentSearches';
const MAX_RECENT_SEARCHES = 8;

export type SearchType = 'events' | 'spaces';

/**
 * Merge a freshly-used search term into the recent-searches list.
 *
 * This is the one spot where the "recents" behaviour is actually decided, and
 * the choices here shape how the history feels day to day:
 *   - de-dupe case-insensitively so "Music" and "music" don't both linger
 *   - move a re-used term back to the front (most-recent-first)
 *   - cap the list so it never grows unbounded
 */
function mergeRecentSearch(existing: string[], term: string): string[] {
  const cleaned = term.trim();
  if (!cleaned) return existing;
  const withoutDupes = existing.filter((t) => t.toLowerCase() !== cleaned.toLowerCase());
  return [cleaned, ...withoutDupes].slice(0, MAX_RECENT_SEARCHES);
}

/** Search sheet state: debounced event + space lookups and persisted recents. */
export function useHomeSearch() {
  const inputRef = useRef<TextInput>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType>('events');
  const [eventResults, setEventResults] = useState<Event[]>([]);
  const [spaceResults, setSpaceResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentSearches(parsed.slice(0, MAX_RECENT_SEARCHES));
      })
      .catch(() => {});
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Record a term when a search actually leads somewhere (a submit or a result
  // tap) rather than on every keystroke, so the history stays meaningful.
  const saveRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => {
      const next = mergeRecentSearch(prev, term);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
  }, []);

  const onChangeQuery = useCallback((next: string) => {
    setQuery(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (next.trim().length === 0) {
      setIsSearching(false);
      setEventResults([]);
      return;
    }
    if (next.trim().length < 2) return;

    setIsSearching(true);
    setLoading(true);
    setSpaceResults([]);

    timeoutRef.current = setTimeout(async () => {
      try {
        const response = await getEvents({ page: 1, limit: 10, search: next });
        setEventResults(response?.events || response?.data || []);
        try {
          const spaceResp = await getAllSpaces({ search: next, limit: 10 });
          setSpaceResults(spaceResp?.spaces || []);
        } catch {
          setSpaceResults([]);
        }
      } catch {
        setEventResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setIsSearching(false);
    setEventResults([]);
    setSpaceResults([]);
  }, []);

  // Run a search from a tapped suggestion; reuses the debounced path.
  const runTerm = useCallback(
    (term: string) => {
      inputRef.current?.focus();
      onChangeQuery(term);
    },
    [onChangeQuery],
  );

  const openSheet = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const closeSheet = useCallback(() => {
    setOpen(false);
    clear();
  }, [clear]);

  return {
    inputRef,
    open,
    openSheet,
    closeSheet,
    query,
    onChangeQuery,
    clear,
    runTerm,
    type,
    setType,
    eventResults,
    spaceResults,
    isSearching,
    loading,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
  };
}

export type HomeSearch = ReturnType<typeof useHomeSearch>;
