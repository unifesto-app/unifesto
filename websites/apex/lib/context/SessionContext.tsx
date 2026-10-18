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
  /**
   * Set when /users/me failed for a reason other than a sign-out (a 401 is
   * already bounced to /login). The role is unknown then, not "none".
   */
  error: string | null;
  /** Force a re-fetch of the session. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  role: "none",
  spaces: [],
  loading: true,
  error: null,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [role, setRole] = useState<AppRole>("none");
  const [spaces, setSpaces] = useState<SpaceWithHierarchy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await getCurrentUser();
      if (error) {
        setError(error.message || "Couldn't load your account.");
        return;
      }
      setUser(data);
      setRole(resolveAppRole(data));

      setSpaces(
        (data?.spaces ?? []).filter((s) => isSpaceOperatorRole(s.userRole?.code))
      );
    } catch {
      setError("Couldn't load your account.");
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
        error,
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
