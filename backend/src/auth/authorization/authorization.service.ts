import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, RoleCode, RoleScope, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Action, ACTION_SCOPE, AuthResource } from './actions';
import { CapabilityConfigService } from './capability-config.service';
import { SPACE_ADMIN_ROLE_CODES } from './role-tiers';

/** Space/event role codes, highest first, for picking the one to report. */
const ROLE_RANK: RoleCode[] = [
  RoleCode.SPACE_ADMIN,
  RoleCode.CURATOR,
  RoleCode.CO_CURATOR,
  RoleCode.CREW,
  RoleCode.JUDGE,
  RoleCode.MENTOR,
  RoleCode.MEMBER,
];

/** Event team standing for role assignment (T1); Space and Platform Admins sit above. */
const TEAM_RANK: Partial<Record<RoleCode, number>> = {
  [RoleCode.CREW]: 1,
  [RoleCode.CO_CURATOR]: 2,
  [RoleCode.CURATOR]: 3,
};

const SPACE_ADMIN_RANK = 4;

/** Who may assign whom (`canAssign`): ADMIN 5, Space Admin 4, the event team, everything else 0. */
const assignRank = (code: RoleCode): number =>
  code === RoleCode.ADMIN
    ? 5
    : SPACE_ADMIN_ROLE_CODES.includes(code)
      ? SPACE_ADMIN_RANK
      : (TEAM_RANK[code] ?? 0);

/**
 * One role assignment the caller holds, flattened for authorization checks.
 */
interface Assignment {
  code: RoleCode;
  scope: RoleScope;
  spaceId: string | null;
  eventId: string | null;
}

/** A per-user override row (F4), as `can()` reads it. */
interface Override {
  action: string;
  allow: boolean;
  spaceId: string | null;
}

/**
 * F4: a per-user override for `action` in `contextSpaceId` (null for platform
 * actions). A denial, everywhere or in this space, wins; then a grant in this
 * space; otherwise undefined and the roles decide.
 */
export function overrideFor(
  overrides: Override[],
  action: Action,
  contextSpaceId: string | null,
): boolean | undefined {
  const hits = overrides.filter(
    (o) => o.action === action && (o.spaceId === null || o.spaceId === contextSpaceId),
  );
  if (hits.some((o) => !o.allow)) return false;
  if (hits.some((o) => o.allow)) return true;
  return undefined;
}

/**
 * Central authorization. Controllers ask `can(user, action, resource)` (or the
 * throwing `assertCan`) instead of hand-rolling role checks. Hand-rolled role
 * checks are what this replaces.
 *
 * Answering a check has three parts:
 *   1. mechanical: does the caller hold a role AT the action's scope, ON the
 *      exact resource, whose capability matrix includes the action? and
 *   2. policy: does a broader-scope role (Platform Admin, or Space Admin of the
 *      event's owning space) grant the action THROUGH the scope boundary?
 *   3. plumbing: for EVENT actions, resolve the event's owning space so (2) can
 *      be evaluated.
 * Part (2) is the real design decision — see `grantsByInheritance` below.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityConfigService,
  ) {}

  async can(
    user: Pick<User, 'id'>,
    action: Action,
    resource: AuthResource = {},
  ): Promise<boolean> {
    return this.canAny(user, action, [resource]);
  }

  /**
   * True when `action` is allowed on ANY of `resources`. Loads the caller's
   * role assignments once, so checking a list (e.g. every co-host space of an
   * event) costs one query instead of one per resource.
   */
  async canAny(
    user: Pick<User, 'id'>,
    action: Action,
    resources: AuthResource[],
  ): Promise<boolean> {
    if (resources.length === 0) return false;
    const [assignments, overrides] = await Promise.all([
      this.loadAssignments(user.id),
      this.loadOverrides(user.id),
    ]);
    // No roles and no grants: nothing can allow, so skip the event-space lookups.
    if (assignments.length === 0 && !overrides.some((o) => o.allow)) return false;
    const scope = ACTION_SCOPE[action];

    for (const resource of resources) {
      // For EVENT actions we need the owning space so a Space Admin of that
      // space can be considered (inheritance).
      const eventSpaceId =
        scope === RoleScope.EVENT && resource.eventId
          ? await this.resolveEventSpace(resource.eventId)
          : null;
      if (this.allows(assignments, overrides, action, resource, eventSpaceId)) return true;
    }
    return false;
  }

  /**
   * The events matching `where` that the EVENT action `action` is allowed on:
   * `can()`'s answer for each, from one role load and one event query, so a
   * list built from it can never disagree with the per-event check (T2). Only
   * events a role or grant could reach are read: an event role's event, a space
   * role's or space grant's events, or all of them for a platform role or a
   * grant that holds everywhere.
   */
  async allowedEventIds(
    user: Pick<User, 'id'>,
    action: Action,
    where: Prisma.EventWhereInput,
  ): Promise<string[]> {
    const [assignments, overrides] = await Promise.all([
      this.loadAssignments(user.id),
      this.loadOverrides(user.id),
    ]);
    const grantsOf = overrides.filter((o) => o.allow && o.action === action);
    const everywhere =
      assignments.some((a) => a.scope === RoleScope.PLATFORM) ||
      grantsOf.some((o) => o.spaceId === null);
    const eventIds = assignments.flatMap((a) => (a.eventId ? [a.eventId] : []));
    const spaceIds = [...assignments, ...grantsOf].flatMap((x) => (x.spaceId ? [x.spaceId] : []));
    if (!everywhere && eventIds.length === 0 && spaceIds.length === 0) return [];
    const events = await this.prisma.event.findMany({
      where: everywhere
        ? where
        : { AND: [where, { OR: [{ id: { in: eventIds } }, { spaceId: { in: spaceIds } }] }] },
      select: { id: true, spaceId: true },
    });
    return events
      .filter((e) => this.allows(assignments, overrides, action, { eventId: e.id }, e.spaceId))
      .map((e) => e.id);
  }

  async assertCan(
    user: Pick<User, 'id'>,
    action: Action,
    resource: AuthResource = {},
  ): Promise<void> {
    if (!(await this.can(user, action, resource))) {
      throw new ForbiddenException(
        `You do not have permission to ${action} this resource`,
      );
    }
  }

  /**
   * The one role-assignment rule (T2): may `actor` give `role` in the space
   * `at.spaceId`, or on the event `at.eventId` that lives in it? Pass the role
   * someone holds now to ask whether the actor may change or remove it. Only
   * roles below the actor's own standing there, and never on themselves:
   * Platform ADMIN, then a Space Admin of the space, then the event's Curator,
   * Co-Curator and Crew. So only a Space Admin or ADMIN makes a Curator (who
   * moves the event's money, D9). One exception: co-admins are self-serve, so
   * in their own space a Space Admin also gives, changes and removes Space
   * Admin (never their own; the members service guards the space owner).
   * Whether the actor may edit the team at all is the caller's `@Can`.
   */
  async canAssign(
    actor: Pick<User, 'id'>,
    role: RoleCode,
    at: { spaceId: string; eventId?: string },
    targetUserId?: string,
  ): Promise<boolean> {
    if (targetUserId === actor.id) return false;
    const standing = Math.max(
      0,
      ...(await this.loadAssignments(actor.id))
        .filter(
          (a) =>
            a.scope === RoleScope.PLATFORM ||
            (a.scope === RoleScope.SPACE && a.spaceId === at.spaceId) ||
            (!!at.eventId && a.eventId === at.eventId),
        )
        .map((a) => assignRank(a.code)),
    );
    const rank = assignRank(role);
    return (
      rank < standing ||
      (!at.eventId && rank === SPACE_ADMIN_RANK && standing === SPACE_ADMIN_RANK)
    );
  }

  /** Every PLATFORM action the caller holds (one role load), for the Apex nav. */
  async platformActions(user: Pick<User, 'id'>): Promise<Action[]> {
    const [assignments, overrides] = await Promise.all([
      this.loadAssignments(user.id),
      this.loadOverrides(user.id),
    ]);
    return (Object.keys(ACTION_SCOPE) as Action[]).filter(
      (action) =>
        ACTION_SCOPE[action] === RoleScope.PLATFORM &&
        overrideFor(overrides, action, null) !== false &&
        assignments.some((a) =>
          this.grants(a, action, RoleScope.PLATFORM, {}, null),
        ),
    );
  }

  /**
   * What the caller may do in one space, for UIs to gate on (T3): their highest
   * space- and event-scoped role codes plus every SPACE and EVENT action `can()`
   * would grant, per-space overrides and inheritance included. EVENT actions are
   * checked on `eventId` when given; without it they mean "on at least one event
   * of this space" (space-level nav, e.g. the Assist inbox for event-only crew).
   * A Space Admin of a space co-hosting `eventId` also gets EVENT_EDIT (below).
   */
  async accessIn(
    user: Pick<User, 'id'>,
    spaceId: string,
    eventId?: string,
  ): Promise<{ spaceRole: RoleCode | null; eventRole: RoleCode | null; capabilities: Action[] }> {
    const [assignments, overrides] = await Promise.all([
      this.loadAssignments(user.id),
      this.loadOverrides(user.id),
    ]);
    const eventSpaceId = eventId ? await this.resolveEventSpace(eventId) : null;
    // No eventId: where each event role's event lives, to keep this space's.
    const eventIds = eventId ? [] : assignments.flatMap((a) => (a.eventId ? [a.eventId] : []));
    const spaceOf = new Map(
      eventIds.length
        ? (
            await this.prisma.event.findMany({
              where: { id: { in: eventIds } },
              select: { id: true, spaceId: true },
            })
          ).map((e) => [e.id, e.spaceId])
        : [],
    );
    const capabilities = (Object.keys(ACTION_SCOPE) as Action[]).filter((action) => {
      const scope = ACTION_SCOPE[action];
      if (scope === RoleScope.PLATFORM) return false;
      if (scope === RoleScope.SPACE)
        return assignments.some((a) => this.grants(a, action, scope, { spaceId }, null));
      if (eventId)
        return assignments.some((a) => this.grants(a, action, scope, { eventId }, eventSpaceId));
      return assignments.some((a) =>
        a.eventId
          ? spaceOf.get(a.eventId) === spaceId &&
            this.grants(a, action, scope, { eventId: a.eventId }, spaceId)
          : this.grants(a, action, scope, {}, spaceId),
      );
    });
    // Co-host rule: mirror EventsService.canManageEvent's fallback, which lets a
    // Space Admin (SPACE_CREATE_EVENT) of a co-hosting space manage the event,
    // i.e. EVENT_EDIT and nothing more. Publish/cancel/delete and team changes
    // stay with the owners (T1); money never flows to co-hosts (D9).
    if (eventId && !capabilities.includes(Action.EVENT_EDIT)) {
      const coHosts = await this.prisma.eventCoHost.findMany({
        // Accepted links only: a pending invite grants nothing (F8).
        where: { eventId, acceptedAt: { not: null } },
        select: { spaceId: true },
      });
      if (
        coHosts.some((c) =>
          assignments.some((a) =>
            this.grants(a, Action.SPACE_CREATE_EVENT, RoleScope.SPACE, { spaceId: c.spaceId }, null),
          ),
        )
      ) {
        capabilities.push(Action.EVENT_EDIT);
      }
    }
    // F4: per-user overrides on top, in this space (or the event's).
    const context = eventSpaceId ?? spaceId;
    const allowed = (Object.keys(ACTION_SCOPE) as Action[]).filter((action) => {
      if (ACTION_SCOPE[action] === RoleScope.PLATFORM) return false;
      const o = overrideFor(overrides, action, ACTION_SCOPE[action] === RoleScope.SPACE ? spaceId : context);
      return o ?? capabilities.includes(action);
    });
    const highest = (match: (a: Assignment) => boolean) =>
      ROLE_RANK.find((code) => assignments.some((a) => a.code === code && match(a))) ?? null;
    return {
      spaceRole: highest((a) => a.scope === RoleScope.SPACE && a.spaceId === spaceId),
      eventRole: eventId ? highest((a) => a.scope === RoleScope.EVENT && a.eventId === eventId) : null,
      capabilities: allowed,
    };
  }

  // --- internals -----------------------------------------------------------

  /** One resource's answer: a per-user override (F4) wins, else the roles. */
  private allows(
    assignments: Assignment[],
    overrides: Override[],
    action: Action,
    resource: AuthResource,
    eventSpaceId: string | null,
  ): boolean {
    const scope = ACTION_SCOPE[action];
    const override = overrideFor(
      overrides,
      action,
      scope === RoleScope.SPACE ? resource.spaceId ?? null : eventSpaceId,
    );
    return override ?? assignments.some((a) => this.grants(a, action, scope, resource, eventSpaceId));
  }

  /** Does a single assignment grant `action` on `resource`? */
  private grants(
    a: Assignment,
    action: Action,
    scope: RoleScope,
    resource: AuthResource,
    eventSpaceId: string | null,
  ): boolean {
    // (1) Direct, same-scope, same-resource capability-matrix match.
    if (this.matchesDirectly(a, action, scope, resource, eventSpaceId))
      return true;

    // (2) Cross-scope inheritance policy (the real design decision).
    return grantsByInheritance(a, action, scope, resource, eventSpaceId);
  }

  /** The mechanical part: right scope, right resource id, matrix contains action. */
  private matchesDirectly(
    a: Assignment,
    action: Action,
    scope: RoleScope,
    resource: AuthResource,
    eventSpaceId: string | null,
  ): boolean {
    if (a.scope !== scope) return false;

    // The assignment must be scoped to the exact resource being acted on.
    if (scope === RoleScope.SPACE && a.spaceId !== resource.spaceId)
      return false;
    if (scope === RoleScope.EVENT && a.eventId !== resource.eventId)
      return false;

    // Direct grants come from the editable, DB-backed matrix, resolved in the
    // context of the owning space so any per-space override applies. For a SPACE
    // action that space is the resource itself; for an EVENT action it is the
    // event's owning space (already resolved by the caller).
    const contextSpaceId =
      scope === RoleScope.SPACE ? resource.spaceId ?? null : eventSpaceId;
    return this.capabilities.effectiveHas(contextSpaceId, a.code, action);
  }

  private async loadAssignments(userId: string): Promise<Assignment[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    // A platform role (ADMIN, EMPLOYEE) counts only on a platform row (T12),
    // the same rule RolesGuard applies.
    const held = rows.filter(
      (r) => r.role.scope !== RoleScope.PLATFORM || (!r.spaceId && !r.eventId),
    );
    return held.map((r) => ({
      code: r.role.code,
      scope: r.role.scope,
      spaceId: r.spaceId,
      eventId: r.eventId,
    }));
  }

  private loadOverrides(userId: string): Promise<Override[]> {
    return this.prisma.userCapabilityOverride.findMany({
      where: { userId },
      select: { action: true, allow: true, spaceId: true },
    });
  }

  /** The event's owning space (null if there is no such event). */
  async resolveEventSpace(eventId: string): Promise<string | null> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { spaceId: true },
    });
    return event?.spaceId ?? null;
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INHERITANCE POLICY — the one genuine design decision in the IAM.  (P0.1)
 * ─────────────────────────────────────────────────────────────────────────────
 * The capability matrix already answers "can a Curator publish THEIR event",
 * "can a Space Admin manage THEIR space", etc. What it deliberately does NOT
 * answer is whether a *broader* role reaches DOWN across a scope boundary:
 *
 *   (a) Platform ADMIN  → should it be a blanket superuser that can perform any
 *       action on any space/event? (Almost always yes — apex runs the platform —
 *       but making it explicit here keeps it auditable and testable.)
 *
 *   (b) SPACE_ADMIN of an event's owning space → may they act on that event
 *       directly (edit / publish / cancel / MOVE MONEY / check-in) WITHOUT an
 *       explicit CURATOR assignment on it? docs/plan.md says a Space Admin
 *       "may curate it themselves", which points toward yes — but note it also
 *       hands space admins event-level money power, so it is a real trade-off.
 *       `eventSpaceId` is the event's resolved owning space; compare it to the
 *       admin's `a.spaceId`.
 *
 * Return true to GRANT via inheritance; false to fall through (deny unless the
 * direct matrix already matched).
 *
 * POLICY (locked 2026-08-09, money restated for D9 by T2):
 *   (a) Platform ADMIN is a blanket superuser.
 *   (b) A Space Admin of the event's owning space inherits every event action
 *       except `event:manage-money`. That is not a money ban: D9 says Space
 *       Admin and Curator both move event money (payouts, refund approvals;
 *       it lands in the space's bank account). Space Admins move it through
 *       `space:manage-money` on the owning space, which every money check
 *       accepts beside `event:manage-money`, so their money power stays one
 *       editable grant. Curators hold `event:manage-money` directly;
 *       Co-Curator and Crew never move money.
 *
 * Pure function (no DB) so it stays trivially unit-testable.
 */

function grantsByInheritance(
  assignment: Assignment,
  action: Action,
  scope: RoleScope,
  _resource: AuthResource,
  eventSpaceId: string | null,
): boolean {
  // (a) Platform ADMIN — superuser over every space and event.
  if (assignment.scope === RoleScope.PLATFORM && assignment.code === RoleCode.ADMIN) {
    return true;
  }

  // (b) Space Admin reaching down into an event inside their own space.
  if (
    scope === RoleScope.EVENT &&
    eventSpaceId !== null &&
    assignment.scope === RoleScope.SPACE &&
    assignment.spaceId === eventSpaceId &&
    SPACE_ADMIN_ROLE_CODES.includes(assignment.code)
  ) {
    // Everything except event:manage-money; their money is space:manage-money (D9).
    return action !== Action.EVENT_MANAGE_MONEY;
  }

  return false;
}
