import { RoleCode } from '@prisma/client';

/**
 * The space-scoped role codes that carry **Space-Admin standing** — the people
 * who run a space and, by inheritance, its events.
 *
 * `SPACE_ADMIN` is the canonical (and now only) code. This is the SINGLE source
 * of truth: every hand-rolled "does this user run the space" membership check
 * must key off this array rather than an inline `[SPACE_ADMIN, ...]` list, so a
 * future rename can never silently lock admins out one service at a time.
 * Matches `SPACE_ADMIN_CODES` used by the inheritance policy.
 */
export const SPACE_ADMIN_ROLE_CODES: readonly RoleCode[] = [
  RoleCode.SPACE_ADMIN,
];
