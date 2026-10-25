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
import { getSpaceAccess } from "@/lib/api/spaces-api";
import type { PlanFeatures, SpaceAccess } from "@/lib/api/spaces-api";
import {
  CurrentUser,
  SpaceAppRole,
  SpaceMembership,
  operatorSpaces,
  roleInSpace,
  hasSpaceAppAccess,
} from "@/lib/types/rbac";

/** Backend action strings the space app gates on (`GET /spaces/:id/access`). */
export type Capability =
  | "space:view"
  | "space:manage-billing"
  | "space:manage-members"
  | "space:manage-money"
  | "space:manage-settings"
  | "space:create-event"
  | "space:manage-email"
  | "space:manage-sponsors"
  | "event:view"
  | "event:edit"
  | "event:publish"
  | "event:cancel"
  | "event:manage-money"
  | "event:assign-crew"
  | "event:check-in"
  | "event:manage-attendees"
  | "event:manage-leaderboard"
  | "event:declare-hackathon-winners"
  | "event:manage-support";

export type SpaceFeature = keyof PlanFeatures;

/** Plan gate: off while loading; on when the space has no plan (backend doesn't enforce then). */
export function featureOn(access: SpaceAccess | null, key: SpaceFeature): boolean {
  if (!access) return false;
  return !access.plan || access.plan.features[key];
}

/** Capability gate: off while loading. */
export function accessCan(access: SpaceAccess | null, cap: Capability): boolean {
  return !!access?.capabilities.includes(cap);
}

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
   * The user's access in `currentSpace` (role, capabilities, plan), or null
   * while it loads. Event capabilities here mean "on some event in the space";
   * event pages use `useAccess(eventId)` instead.
   */
  access: SpaceAccess | null;
  /** True when the backend grants `cap` in `currentSpace`. False while loading. */
  can: (cap: Capability) => boolean;
  /** True when the current space's plan includes `key`. */
  hasFeature: (key: SpaceFeature) => boolean;
  /** The current space's plan and billing model, or null while they load. */
  billing: { plan: string; billingModel: string } | null;
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
  access: null,
  can: () => false,
  hasFeature: () => false,
  billing: null,
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
  const [access, setAccess] = useState<SpaceAccess | null>(null);
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
    eventAccessCache.clear();
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

  // Load the user's access in the current space. Re-runs on space switch (and
  // on refresh); clears on a switch so a stale space's access never gates the new one.
  const accessSpaceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const spaceId = currentSpace?.id;
    if (accessSpaceRef.current !== spaceId) setAccess(null);
    accessSpaceRef.current = spaceId;
    if (!spaceId) return;
    let cancelled = false;
    void getSpaceAccess(spaceId).then(({ data }) => {
      if (!cancelled) setAccess(data);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id, user]);

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
        access,
        can: (cap) => !!access?.capabilities.includes(cap),
        hasFeature: (key) => featureOn(access, key),
        billing: access?.plan
          ? { plan: access.plan.plan, billingModel: access.plan.billingModel }
          : null,
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

// Event access, shared by every component on an event page. Cleared on each
// session (re)load so a role change shows up after refresh.
const eventAccessCache = new Map<string, Promise<SpaceAccess | null>>();

/**
 * Access for the current space, or for one of its events when `eventId` is
 * given (event capabilities checked on that event: event-only Curators, Crew,
 * per-space overrides and Space Admin inheritance all resolved by the backend).
 */
export function useAccess(eventId?: string) {
  const session = useSession();
  const spaceId = session.currentSpace?.id;
  const [eventAccess, setEventAccess] = useState<SpaceAccess | null>(null);

  useEffect(() => {
    setEventAccess(null);
    if (!eventId || !spaceId) return;
    const key = `${spaceId}:${eventId}`;
    let pending = eventAccessCache.get(key);
    if (!pending) {
      pending = getSpaceAccess(spaceId, eventId).then(({ data }) => {
        if (!data) eventAccessCache.delete(key);
        return data;
      });
      eventAccessCache.set(key, pending);
    }
    let cancelled = false;
    void pending.then((data) => {
      if (!cancelled) setEventAccess(data);
    });
    return () => {
      cancelled = true;
    };
  }, [spaceId, eventId, session.user]);

  const access = eventId ? eventAccess : session.access;
  return {
    access,
    loading: !access,
    can: (cap: Capability) => !!access?.capabilities.includes(cap),
    hasFeature: (key: SpaceFeature) => featureOn(access, key),
  };
}
