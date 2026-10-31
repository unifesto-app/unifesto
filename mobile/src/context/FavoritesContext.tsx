import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  getFavoriteIds,
  addFavorite,
  removeFavorite,
} from '../lib/api/favorites';

interface FavoritesContextType {
  /** Set of favourited event ids for O(1) heart lookups. */
  favoriteIds: Set<string>;
  isFavorite: (eventId: string) => boolean;
  /** Optimistically toggle; reconciles with the server, rolling back on failure. */
  toggleFavorite: (eventId: string) => Promise<void>;
  /** Re-pull the id set from the server (e.g. after opening the favourites screen). */
  refresh: () => Promise<void>;
  /** A Save tapped while signed out: saved as soon as the person signs in. */
  saveAfterSignIn: (eventId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined,
);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // Guards against overlapping toggles on the same id (double-tap).
  const inFlight = useRef<Set<string>>(new Set());
  const pendingSave = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setFavoriteIds(new Set());
      return;
    }
    const ids = new Set(await getFavoriteIds());
    const id = pendingSave.current;
    pendingSave.current = null;
    if (id && !ids.has(id) && (await addFavorite(id))) ids.add(id);
    setFavoriteIds(ids);
  }, [isAuthenticated]);

  const saveAfterSignIn = useCallback((eventId: string) => {
    pendingSave.current = eventId;
  }, []);

  // Load on auth change; clear on logout.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const isFavorite = useCallback(
    (eventId: string) => favoriteIds.has(eventId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    async (eventId: string) => {
      if (!isAuthenticated || inFlight.current.has(eventId)) return;
      inFlight.current.add(eventId);

      const wasFavorite = favoriteIds.has(eventId);
      // Optimistic update.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(eventId);
        else next.add(eventId);
        return next;
      });

      const ok = wasFavorite
        ? await removeFavorite(eventId)
        : await addFavorite(eventId);

      if (!ok) {
        // Roll back to the pre-toggle state.
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(eventId);
          else next.delete(eventId);
          return next;
        });
      }
      inFlight.current.delete(eventId);
    },
    [favoriteIds, isAuthenticated],
  );

  const value = useMemo(
    () => ({ favoriteIds, isFavorite, toggleFavorite, refresh, saveAfterSignIn }),
    [favoriteIds, isFavorite, toggleFavorite, refresh, saveAfterSignIn],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
}
