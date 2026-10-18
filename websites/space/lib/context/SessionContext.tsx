"use client";

import React, {
  useRef,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getCurrentUser } from "@/lib/api/current-user-api";
import { getSpaceUsage } from "@/lib/api/subscriptions-api";
import type { SubscriptionUsage } from "@/lib/api/subscriptions-api";
import {
  CurrentUser,
  SpaceAppRole,
  SpaceMembership,
  operatorSpaces,
  roleInSpace,
  hasSpaceAppAccess,
} from "@/lib/types/rbac";

/** Effective, backend-computed feature flags for the current space. */
export type SpaceFeatures = SubscriptionUsage["features"];

interface SessionContextValue {
  /** The signed-in user, or null while loading / unauthenticated. */
  user: CurrentUser | null;
  /** True when the user holds an operator role in ≥1 space (belongs here). */
  hasAccess: boolean;
  /** Spaces the user can operate (space_admin / curator / co_curator / crew). */
  spaces: SpaceMembership[];
  /** The currently-selected space. */
  currentSpace: SpaceMembership | null;
  setCurrentSpace: (space: SpaceMembership) => void;
  /** The user's surface role within `currentSpace` (or `none`). */
  currentRole: SpaceAppRole;
  /**
   * Effective plan feature flags for `currentSpace`, or `null` while they load.
   * `null` means "unknown" — gate optimistically (show) until it resolves.
   */
  features: SpaceFeatures | null;
  loading: boolean;
  /** Force a re-fetch of the session. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  hasAccess: false,
  spaces: [],
  currentSpace: null,
  setCurrentSpace: () => {},
  currentRole: "none",
  features: null,
  loading: true,
  refresh: async () => {},
});

const STORAGE_KEY = "space_current_space_id";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [spaces, setSpaces] = useState<SpaceMembership[]>([]);
  const [currentSpace, setCurrentSpaceState] = useState<SpaceMembership | null>(
    null
  );
  const [features, setFeatures] = useState<SpaceFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<CurrentUser | null>(null);

  const setCurrentSpace = useCallback((space: SpaceMembership) => {
    setCurrentSpaceState(space);
    try {
      localStorage.setItem(STORAGE_KEY, space.id);
    } catch {
      /* ignore */
    }
  }, []);

  // `loading` only covers the first load. A later refresh (e.g. after saving
  // settings) updates in place: flipping `loading` would swap the whole
  // dashboard for the shell skeleton and unmount the page that asked.
  const load = useCallback(async () => {
    try {
      const { data, error } = await getCurrentUser();
      // A failed refresh keeps the session we have rather than signing out.
      if (error && userRef.current) return;
      setUser(data);
      userRef.current = data;

      const ops = operatorSpaces(data);
      setSpaces(ops);

      let savedId: string | null = null;
      try {
        savedId = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const saved = ops.find((s) => s.id === savedId);
      setCurrentSpaceState(saved || ops[0] || null);
    } catch {
      setUser(null);
      setSpaces([]);
      setCurrentSpaceState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Load the current space's effective plan flags. Re-runs on space switch;
  // clears first so a stale space's flags never gate the new one.
  useEffect(() => {
    const spaceId = currentSpace?.id;
    if (!spaceId) {
      setFeatures(null);
      return;
    }
    let cancelled = false;
    setFeatures(null);
    void getSpaceUsage(spaceId).then(({ data }) => {
      if (!cancelled) setFeatures(data?.features ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  const currentRole: SpaceAppRole = currentSpace
    ? roleInSpace(user, currentSpace.id)
    : "none";

  return (
    <SessionContext.Provider
      value={{
        user,
        hasAccess: hasSpaceAppAccess(user),
        spaces,
        currentSpace,
        setCurrentSpace,
        currentRole,
        features,
        loading,
        refresh: load,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
