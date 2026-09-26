"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getCurrentUser } from "@/lib/api/current-user-api";
import {
  AppRole,
  CurrentUser,
  SpaceWithHierarchy,
  isSpaceOperatorRole,
  resolveAppRole,
} from "@/lib/types/rbac";

interface SessionContextValue {
  /** The signed-in user, or null while loading / unauthenticated. */
  user: CurrentUser | null;
  /** Which Apex surface this user belongs to. */
  role: AppRole;
  /** Organiser spaces the user can manage (organiser surface only). */
  spaces: SpaceWithHierarchy[];
  /** The currently-selected organiser space. */
  currentSpace: SpaceWithHierarchy | null;
  setCurrentSpace: (space: SpaceWithHierarchy) => void;
  loading: boolean;
  /** Force a re-fetch of the session. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  role: "none",
  spaces: [],
  currentSpace: null,
  setCurrentSpace: () => {},
  loading: true,
  refresh: async () => {},
});

const STORAGE_KEY = "apex_current_space_id";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [role, setRole] = useState<AppRole>("none");
  const [spaces, setSpaces] = useState<SpaceWithHierarchy[]>([]);
  const [currentSpace, setCurrentSpaceState] =
    useState<SpaceWithHierarchy | null>(null);
  const [loading, setLoading] = useState(true);

  const setCurrentSpace = useCallback((space: SpaceWithHierarchy) => {
    setCurrentSpaceState(space);
    try {
      localStorage.setItem(STORAGE_KEY, space.id);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getCurrentUser();
      setUser(data);
      setRole(resolveAppRole(data));

      const organiserSpaces = (data?.spaces ?? []).filter((s) =>
        isSpaceOperatorRole(s.userRole?.code)
      );
      setSpaces(organiserSpaces);

      let savedId: string | null = null;
      try {
        savedId = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const saved = organiserSpaces.find((s) => s.id === savedId);
      setCurrentSpaceState(saved || organiserSpaces[0] || null);
    } catch {
      setUser(null);
      setRole("none");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SessionContext.Provider
      value={{
        user,
        role,
        spaces,
        currentSpace,
        setCurrentSpace,
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
