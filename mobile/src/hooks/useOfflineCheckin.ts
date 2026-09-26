import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { isOnline } from '../lib/offline/connectivity';
import {
  dismissReviewItem,
  downloadRoster,
  ensureFreshRoster,
  getCheckinStore,
  pullChanges,
  subscribe,
  syncNow,
  type OfflineCheckinSnapshot,
} from '../lib/offline/checkinQueue';

/** How often an open check-in screen pulls other devices' changes. */
const PULL_INTERVAL_MS = 30_000;

const EMPTY: OfflineCheckinSnapshot = {
  ready: false,
  rosterSavedAt: null,
  rosterSize: 0,
  pending: 0,
  review: [],
  downloading: false,
  syncing: false,
  error: null,
};

/**
 * One event's offline check-in state for the signed-in user: the saved guest
 * list, queued check-ins, and anything the server refused or flagged as a
 * duplicate on sync. While mounted it pulls the crew's changes every 30s.
 * `store` is null until the user is known.
 */
export function useOfflineCheckin(eventId: string) {
  const { user } = useAuth();
  const store = useMemo(() => (user?.id && eventId ? getCheckinStore(user.id, eventId) : null), [user?.id, eventId]);

  const snapshot = useSyncExternalStore(
    useCallback((l: () => void) => (store ? subscribe(store, l) : () => {}), [store]),
    () => store?.snapshot ?? EMPTY,
    () => store?.snapshot ?? EMPTY,
  );

  useEffect(() => {
    if (!store) return;
    void ensureFreshRoster(store);
    // While a check-in screen is open, keep in step with the rest of the crew.
    const t = setInterval(() => {
      if (isOnline()) void pullChanges(store);
    }, PULL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [store]);

  return {
    store,
    ...snapshot,
    download: useCallback(() => (store ? downloadRoster(store) : Promise.resolve()), [store]),
    sync: useCallback(() => (store ? syncNow(store) : Promise.resolve()), [store]),
    dismiss: useCallback((id: string) => (store ? dismissReviewItem(store, id) : Promise.resolve()), [store]),
  };
}
