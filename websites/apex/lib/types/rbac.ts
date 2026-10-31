/**
 * RBAC Type Definitions — unified for Apex.
 *
 * Apex serves two audiences from one shell:
 *   - Platform staff   → the PLATFORM_ADMIN surface (mission control)
 *   - Space operators   → the SPACE_ADMIN surface (bounced to the space app)
 *
 * Every user holds exactly ONE active surface. A user is either platform
 * staff (Platform Admin) OR a space operator (Space Admin) — never both at
 * once. Platform Admin takes precedence if a user somehow qualifies for both.
 * Within the space surface, *space role codes* decide what they can do per
 * space.
 */

// ---------------------------------------------------------------------------
// Platform-level roles (profiles.role) — decide dashboard access.
// ---------------------------------------------------------------------------

export type PlatformRole =
  | "attendee"
  | "organizer"
  | "org_admin"
  | "org_super_admin"
  | "super_admin";

/**
 * Backend role codes that grant access to the ADMIN surface.
 * The backend defines a single platform-admin code: `ADMIN`.
 */
export const ADMIN_ROLE_CODES = ["ADMIN"] as const;

export type AdminRoleCode = (typeof ADMIN_ROLE_CODES)[number];

/** True when a backend role code grants platform-admin access. */
export function isAdminRole(code?: string | null): boolean {
  return !!code && (ADMIN_ROLE_CODES as readonly string[]).includes(code);
}

/**
 * Platform-scoped Unifesto team member. Sees only the Apex pages their
 * platform capabilities open (`CurrentUser.platform`). Admin wins over it.
 */
export const EMPLOYEE_ROLE_CODE = "EMPLOYEE";

// ---------------------------------------------------------------------------
// Space-level role codes — decide space-operator permissions per space.
// ---------------------------------------------------------------------------

export type SpaceRoleCode =
  | "SPACE_ADMIN"
  | "CURATOR"
  | "CO_CURATOR"
  | "CREW"
  | "MEMBER"
  | "ADMIN";

/**
 * Space roles with an operator surface in the Space app. Apex sends them there
 * instead of to /no-access.
 */
export const SPACE_OPERATOR_ROLE_CODES: SpaceRoleCode[] = ["SPACE_ADMIN", "CURATOR", "CO_CURATOR", "CREW"];

/** True when a space role grants space-operator access. */
export function isSpaceOperatorRole(code?: string | null): boolean {
  return !!code && SPACE_OPERATOR_ROLE_CODES.includes(code as SpaceRoleCode);
}

// ---------------------------------------------------------------------------
// The Apex "app role" — which surface a signed-in user sees.
// ---------------------------------------------------------------------------

export type AppRole = "platform_admin" | "employee" | "space_admin" | "none";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  /** Platform role code as returned by the backend (ADMIN, else EMPLOYEE). */
  role?: string | null;
  /**
   * The caller's PLATFORM capabilities (`company:*`, `product:*`), from
   * `GET /users/me/access`. Loaded for employees only; admins hold them all.
   */
  platform?: string[];
  /** Space memberships (for space-operator access). */
  spaces?: SpaceWithHierarchy[];
}

/** True when the user holds any space-operator role in any space. */
export function hasSpaceAccess(user?: CurrentUser | null): boolean {
  return (user?.spaces ?? []).some((s) => isSpaceOperatorRole(s.userRole?.code));
}

/**
 * Resolve the single Apex surface for a user.
 *
 * Each user has exactly one active surface — there is no dual-role switching.
 * Platform Admin takes precedence: platform staff land on the PLATFORM_ADMIN
 * surface. An Employee gets a restricted Apex (capability-filtered nav).
 * Otherwise a user holding a space-operator role in any space lands
 * on the SPACE_ADMIN surface. Everyone else resolves to `none` (bounced to
 * /login).
 */
export function resolveAppRole(user?: CurrentUser | null): AppRole {
  if (!user) return "none";
  if (isAdminRole(user.role)) return "platform_admin";
  if (user.role === EMPLOYEE_ROLE_CODE) return "employee";
  if (hasSpaceAccess(user)) return "space_admin";
  return "none";
}

/**
 * Absolute URL of the organiser console (www.unifesto.app/console, Track V).
 *
 * Apex is platform-staff only now (P1.4): the operator surface moved to the
 * console. A signed-in organiser who lands on Apex is sent here instead of
 * shown an organiser dashboard; the console asks them to sign in on web if
 * they aren't already.
 */
export function spaceUrl(): string {
  return process.env.NEXT_PUBLIC_SPACE_URL || "https://www.unifesto.app/console";
}

// ---------------------------------------------------------------------------
// Space types (organiser surface).
// ---------------------------------------------------------------------------

export type SpaceType = "university" | "college" | "club" | "community";

/**
 * Structural kind of a space (backend `SpaceType`).
 *   - SUPER   → a parent space that can own child spaces.
 *   - REGULAR → an individual space, or a child of a SUPER space.
 */
export type SpaceKind = "SUPER" | "REGULAR";

/**
 * Lifecycle state of a space (backend `SpaceStatus`). PENDING spaces await
 * admin approval; APPROVED/ACTIVE are live; the rest are admin-managed states.
 */
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

export interface SpaceWithHierarchy extends SpaceWithCounts {
  /** The current user's role in this space, from `GET /users/me/spaces`. */
  userRole?: {
    id: string;
    code: SpaceRoleCode;
    name: string;
  } | null;
  /**
   * Structural kind (SUPER/REGULAR) as sent by the backend. Distinct from the
   * organiser-facing `type` (university/college/…). Present on `GET /spaces/:id`.
   */
  spaceKind?: SpaceKind;
  /** Lifecycle state, present on `GET /spaces/:id`. */
  status?: SpaceStatus;
  /**
   * User id of the space's owner. Present on `GET /spaces/:id`, not on the
   * `GET /users/me/spaces` list — read it from a space detail fetch, not from
   * the session's `spaces` array.
   */
  createdBy?: string;
  parentSpaceId?: string | null;
  parentSpace?: {
    id: string;
    name: string;
    slug: string;
    type?: SpaceKind;
  } | null;
  /** Count relations (if included) */
  _count?: {
    events?: number;
    members?: number;
  };
  /** Additional display fields */
  logoUrl?: string | null;
  tagline?: string | null;
}

// ---------------------------------------------------------------------------
// Event types (shared).
// ---------------------------------------------------------------------------

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
  createdBy: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
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
