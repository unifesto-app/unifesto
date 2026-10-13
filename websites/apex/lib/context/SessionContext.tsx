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
  /** Spaces where the user holds a space-operator role (shown on Profile). */
  spaces: SpaceWithHierarchy[];
  loading: boolean;
  /** Force a re-fetch of the session. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  role: "none",
  spaces: [],
  loading: true,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [role, setRole] = useState<AppRole>("none");
  const [spaces, setSpaces] = useState<SpaceWithHierarchy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getCurrentUser();
      setUser(data);
      setRole(resolveAppRole(data));

      setSpaces(
        (data?.spaces ?? []).filter((s) => isSpaceOperatorRole(s.userRole?.code))
      );
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
