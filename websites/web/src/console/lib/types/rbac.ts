/**
 * RBAC — the organiser console (/console)
 *
 * This app serves ONE audience: the people who run a space and its events.
 * Platform staff live in Apex (apex.unifesto.app); they do not belong here.
 * The surface roles, highest privilege first, are:
 *
 *   space_admin → runs the space: billing/plan, members, events, money
 *   curator     → owns a single event end-to-end
 *   co_curator  → helps run an event (no publish/cancel, no money)
 *   crew        → on-the-ground help: check-in / scanning only
 *
 * A user's surface role is the HIGHEST role they hold in the space they are
 * currently acting in. Everything else (attendee, plain member, platform-only
 * admin with no space role) resolves to `none` and is bounced.
 */

// ---------------------------------------------------------------------------
// Backend role codes → space-app surface roles.
//
// The role vocabulary is SPACE_ADMIN / CURATOR / CO_CURATOR / CREW. This single
// map is the ONLY place that translates a backend `RoleCode` to a surface role.
// ---------------------------------------------------------------------------

export type SpaceAppRole =
  | "space_admin"
  | "curator"
  | "co_curator"
  | "crew"
  | "none";

/** How a role reads in the console (Home's My spaces). */
export const ROLE_LABEL: Record<SpaceAppRole, string> = {
  space_admin: "Space Admin",
  curator: "Curator",
  co_curator: "Co-Curator",
  crew: "Crew",
  none: "",
};

/** Priority order used to pick the single governing role (high → low). */
const ROLE_PRIORITY: SpaceAppRole[] = [
  "space_admin",
  "curator",
  "co_curator",
  "crew",
  "none",
];

/**
 * Map a backend `RoleCode` to a space-app surface role.
 *
 * MEMBER intentionally maps to `none`: being a plain member of a space is not,
 * by itself, a reason to enter the operator app.
 */
const ROLE_CODE_TO_APP_ROLE: Record<string, SpaceAppRole> = {
  SPACE_ADMIN: "space_admin",
  CURATOR: "curator",
  CO_CURATOR: "co_curator",
  CREW: "crew",

  // Explicitly NOT an operator: a plain member never enters this app.
  MEMBER: "none",
};

/** Translate one backend code (any casing tolerated) to a surface role. */
export function appRoleFromCode(code?: string | null): SpaceAppRole {
  if (!code) return "none";
  return ROLE_CODE_TO_APP_ROLE[code.toUpperCase()] ?? "none";
}

/** The higher-privilege of two surface roles. */
export function higherRole(a: SpaceAppRole, b: SpaceAppRole): SpaceAppRole {
  return ROLE_PRIORITY.indexOf(a) <= ROLE_PRIORITY.indexOf(b) ? a : b;
}

/**
 * True when `role` ranks strictly above the event role `code`. The backend
 * only lets you grant, change or remove event roles below your own (T1).
 */
export function outranks(role: SpaceAppRole, code?: string | null): boolean {
  return ROLE_PRIORITY.indexOf(role) < ROLE_PRIORITY.indexOf(appRoleFromCode(code));
}

// ---------------------------------------------------------------------------
// Session shapes (subset of the backend's /users/me + /users/me/spaces).
// ---------------------------------------------------------------------------

/**
 * A space the current user operates. This is the rich hierarchy shape the
 * backend returns from `GET /users/me/spaces` — the same payload Apex reads —
 * so ported operator pages and the sidebar can rely on counts, descriptions,
 * and structural kind without a second fetch. See {@link SpaceWithHierarchy}.
 */
export type SpaceMembership = SpaceWithHierarchy;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  /** Platform role code (e.g. ADMIN). Present only for platform staff. */
  platformRole?: string | null;
  /** Space memberships that decide space-app access. */
  spaces?: SpaceMembership[];
}

// ---------------------------------------------------------------------------
// Access resolution.
// ---------------------------------------------------------------------------

/**
 * Spaces the user can operate: those where they hold a space-level operator
 * role, OR spaces they can reach only through an event-scoped role
 * (curator/co-curator/crew assigned to an event — see `eventAccess`).
 */
export function operatorSpaces(user?: CurrentUser | null): SpaceMembership[] {
  return (user?.spaces ?? []).filter(
    (s) =>
      appRoleFromCode(s.userRole?.code) !== "none" ||
      (s.eventAccess?.length ?? 0) > 0
  );
}

/**
 * True when the user has NO space-level operator role here and is present only
 * through event-scoped role(s). Such a user gets an event-only experience: they
 * reach their event(s) but no space-level pages.
 */
export function isEventScopedSpace(space?: SpaceMembership | null): boolean {
  return (
    appRoleFromCode(space?.userRole?.code) === "none" &&
    (space?.eventAccess?.length ?? 0) > 0
  );
}

/**
 * The user's surface role in a specific space (the governing role there).
 */
export function roleInSpace(
  user: CurrentUser | null | undefined,
  spaceId: string
): SpaceAppRole {
  const space = (user?.spaces ?? []).find((s) => s.id === spaceId);
  return appRoleFromCode(space?.userRole?.code);
}

/**
 * Does this user belong in the organiser console at all?
 *
 * True when they hold an operator role in at least one space. A platform-only
 * admin (no space role) is NOT admitted here — they use Apex. This is the gate
 * `proxy.ts` and the dashboard guard both lean on.
 */
export function hasSpaceAppAccess(user?: CurrentUser | null): boolean {
  return operatorSpaces(user).length > 0;
}

/** Platform role codes that live in Apex, not here: Admin and Employee. */
const PLATFORM_STAFF_CODES = new Set(["ADMIN", "EMPLOYEE"]);

/**
 * True when the account is platform staff (works in Apex). The console home
 * offers them a way into Apex.
 */
export function isPlatformStaff(user?: CurrentUser | null): boolean {
  return !!user?.platformRole && PLATFORM_STAFF_CODES.has(user.platformRole.toUpperCase());
}

/** Absolute URL of the Apex console (platform staff surface). */
export function apexUrl(): string {
  return process.env.NEXT_PUBLIC_APEX_URL || "https://apex.unifesto.app";
}

// ===========================================================================
// Shared domain types (ported from Apex).
//
// These describe the backend's Space and Event payloads. The operator pages
// ported from Apex import them from here; the space app keeps its own access
// model (above) but shares the wire shapes so the two apps cannot drift. Keep
// this block in lockstep with `apex/lib/types/rbac.ts` until P3.1 extracts a
// shared package.
// ===========================================================================

// --- Space role codes (see ROLE_CODE map). ----------------------------------
// What a role may DO comes from the backend: `GET /spaces/:id/access`
// (`useAccess` / `useSession().can`). There is no capability matrix here.

export type SpaceRoleCode =
  | "SPACE_ADMIN"
  | "CURATOR"
  | "CO_CURATOR"
  | "CREW"
  | "MEMBER"
  | "ADMIN";

// --- Spaces ----------------------------------------------------------------

export type SpaceType = "university" | "college" | "club" | "community";

/**
 * Structural kind of a space (backend `SpaceType`).
 *   - SUPER   → a parent space that can own child spaces.
 *   - REGULAR → an individual space, or a child of a SUPER space.
 */
export type SpaceKind = "SUPER" | "REGULAR";

/** Lifecycle state of a space (backend `SpaceStatus`). */
export type SpaceStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "ARCHIVED";

export interface Space {
  id: string;
  name: string;
  slug: string;
  type: SpaceType;
  description: string | null;
  parent_org_id: string | null;
  super_admin_id: string | null;
  depth_level: number;
  logo_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpaceWithCounts extends Space {
  member_count: number;
  sub_org_count: number;
}

/**
 * An event the user can operate through an event-scoped role, surfaced on the
 * space membership by `GET /users/me/spaces?includeEventRoles=true`.
 */
export interface EventAccessEntry {
  eventId: string;
  title: string;
  status: string;
  roleCode: SpaceRoleCode;
}

export interface SpaceWithHierarchy extends SpaceWithCounts {
  /** The current user's role in this space, from `GET /users/me/spaces`. */
  userRole?: {
    id: string;
    code: SpaceRoleCode;
    name: string;
  } | null;
  /**
   * Events the user can operate here via an event-scoped role. Present (space
   * app only) when they hold no space-level role but were added to an event's
   * team. Drives the event-only experience.
   */
  eventAccess?: EventAccessEntry[];
  /**
   * Structural kind (SUPER/REGULAR). Distinct from the organiser-facing `type`
   * (university/college/…). Present on `GET /spaces/:id`.
   */
  spaceKind?: SpaceKind;
  /** Lifecycle state, present on `GET /spaces/:id`. */
  status?: SpaceStatus;
  /**
   * User id of the space's owner. Present on `GET /spaces/:id`, not on the
   * `GET /users/me/spaces` list.
   */
  createdBy?: string;
  parentSpaceId?: string | null;
  parentSpace?: {
    id: string;
    name: string;
    slug: string;
    type?: SpaceKind;
  } | null;
  _count?: {
    events?: number;
    members?: number;
  };
  logoUrl?: string | null;
  tagline?: string | null;
}

// --- Events ----------------------------------------------------------------

export type EventStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "cancelled";

export type EventType = "online" | "offline" | "hybrid";

export interface EventWithDetails {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  spaceId: string;
  status: EventStatus;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  type: "IN_PERSON" | "ONLINE" | "HYBRID";
  registrationType: "RSVP" | "TICKETED" | "MIXED";
  venueName: string | null;
  venueAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string | null;
  onlinePlatform: string | null;
  capacity: number | null;
  registeredCount: number;
  waitlistEnabled: boolean;
  waitlistCount: number;
  isFree: boolean;
  is_free: boolean; // alias for compatibility
  tags: string[];
  category: string | null;
  visibility: "PUBLIC" | "PRIVATE" | "SPACE_ONLY";
  coverImageUrl: string | null;
  isRecurring: boolean;
  recurringRule: string | null;
  createdBy: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  space?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  creator?: {
    id: string;
    fullName: string;
    username: string;
    avatarUrl: string | null;
  };
  ticketTypes?: Array<{
    price: number;
    currency: string;
  }>;
  _count?: {
    registrations: number;
  };
  // Legacy aliases for backward compatibility
  start_date?: string;
  end_date?: string;
  event_type?: EventType;
  venue?: string | null;
  image_url?: string | null;
  max_attendees?: number | null;
  price?: number | null;
  currency?: string | null;
  created_at?: string;
  updated_at?: string;
}
