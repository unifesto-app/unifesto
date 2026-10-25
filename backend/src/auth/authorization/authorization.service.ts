import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleCode, RoleScope, User } from '@prisma/client';
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

/**
 * One role assignment the caller holds, flattened for authorization checks.
 */
interface Assignment {
  code: RoleCode;
  scope: RoleScope;
  spaceId: string | null;
  eventId: string | null;
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
    const assignments = await this.loadAssignments(user.id);
    // No roles at all: nothing can grant, so skip the event-space lookups.
    if (assignments.length === 0) return false;
    const scope = ACTION_SCOPE[action];

    for (const resource of resources) {
      // For EVENT actions we need the owning space so a Space Admin of that
      // space can be considered (inheritance).
      const eventSpaceId =
        scope === RoleScope.EVENT && resource.eventId
          ? await this.resolveEventSpace(resource.eventId)
          : null;
      if (
        assignments.some((a) =>
          this.grants(a, action, scope, resource, eventSpaceId),
        )
      ) {
        return true;
      }
    }
    return false;
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

  /** Every PLATFORM action the caller holds (one role load), for the Apex nav. */
  async platformActions(user: Pick<User, 'id'>): Promise<Action[]> {
    const assignments = await this.loadAssignments(user.id);
    return (Object.keys(ACTION_SCOPE) as Action[]).filter(
      (action) =>
        ACTION_SCOPE[action] === RoleScope.PLATFORM &&
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
   */
  async accessIn(
    user: Pick<User, 'id'>,
    spaceId: string,
    eventId?: string,
  ): Promise<{ spaceRole: RoleCode | null; eventRole: RoleCode | null; capabilities: Action[] }> {
    const assignments = await this.loadAssignments(user.id);
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
    const highest = (match: (a: Assignment) => boolean) =>
      ROLE_RANK.find((code) => assignments.some((a) => a.code === code && match(a))) ?? null;
    return {
      spaceRole: highest((a) => a.scope === RoleScope.SPACE && a.spaceId === spaceId),
      eventRole: eventId ? highest((a) => a.scope === RoleScope.EVENT && a.eventId === eventId) : null,
      capabilities,
    };
  }

  // --- internals -----------------------------------------------------------

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
    return rows.map((r) => ({
      code: r.role.code,
      scope: r.role.scope,
      spaceId: r.spaceId,
      eventId: r.eventId,
    }));
  }

  private async resolveEventSpace(eventId: string): Promise<string | null> {
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
 * POLICY (locked 2026-08-09):
 *   (a) Platform ADMIN is a blanket superuser.
 *   (b) A Space Admin of the event's owning space inherits EVERY event action
 *       EXCEPT money (`event:manage-money`) — separation of duty: they can run
 *       the event but cannot unilaterally move its funds; that still needs an
 *       explicit Curator.
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
    // Everything except moving the event's money.
    return action !== Action.EVENT_MANAGE_MONEY;
  }

  return false;
}
