import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { RoleCode, RoleScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Action, ACTION_SCOPE } from './actions';
import { CAPABILITIES } from './capabilities';

/**
 * The roles the IAM matrix exposes as rows, each with the scope whose actions
 * it can be granted. `editable: false` marks a row the console shows but never
 * lets anyone toggle.
 *
 * Only the current vocabulary is listed. The legacy codes
 * (ORGANISER / CO_ORGANISER / VOLUNTEER) are intentionally absent: the P2.2
 * backfill retired them, so surfacing them as editable rows would only be
 * confusing. Their compiled shims in capabilities.ts still keep any stray
 * un-migrated assignment working — authorization reads the capability cache,
 * not this catalogue — but they are no longer managed from the console.
 *
 * ADMIN is present only so the console can *explain* platform-admin power; its
 * grants come from the inheritance rule in AuthorizationService, never from this
 * table, so it is permanently locked. MEMBER/JUDGE are omitted — they carry no
 * operator actions here.
 */
interface RoleMeta {
  code: RoleCode;
  scope: RoleScope;
  editable: boolean;
  note?: string;
}

const ROLE_CATALOGUE: readonly RoleMeta[] = [
  {
    code: RoleCode.ADMIN,
    scope: RoleScope.PLATFORM,
    editable: false,
    note: 'Platform superuser — full access to every space and event by inheritance. Not governed by this matrix and cannot be edited.',
  },
  {
    code: RoleCode.EMPLOYEE,
    scope: RoleScope.PLATFORM,
    editable: true,
    note: 'Unifesto team member. platform:manage and company:manage can never be granted.',
  },
  { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, editable: true },
  { code: RoleCode.CURATOR, scope: RoleScope.EVENT, editable: true },
  { code: RoleCode.CO_CURATOR, scope: RoleScope.EVENT, editable: true },
  { code: RoleCode.CREW, scope: RoleScope.EVENT, editable: true },
];

// The IAM console itself is @Can(platform:manage), so granting it to EMPLOYEE
// would let an employee grant themselves anything. company:manage (create and
// assign company items) stays with ADMIN too.
const EMPLOYEE_NEVER_GRANTABLE: readonly Action[] = [
  Action.PLATFORM_MANAGE,
  Action.COMPANY_MANAGE,
];

// ---- "IAM for Spaces" policy (per-space overrides) --------------------------
//
// A Space Admin may tune ONLY their event teams, and only within event scope.
// SPACE_ADMIN is never overridable (a space must not be able to lock its own
// admin out — the same lockout-proof stance ADMIN has on the platform console).
const SPACE_OVERRIDABLE_ROLES: readonly RoleCode[] = [
  RoleCode.CURATOR,
  RoleCode.CO_CURATOR,
  RoleCode.CREW,
];

// `event:manage-money` stays platform-controlled: a space can never grant it via
// an override (separation of duty). It always resolves through the GLOBAL matrix
// regardless of any per-space rows, and cannot be toggled here.
const SPACE_LOCKED_ACTIONS: readonly Action[] = [Action.EVENT_MANAGE_MONEY];

// `event:view` is mandatory for any overridable role: a role that cannot even
// see the event is nonsensical, and keeping it always-present guarantees a
// customised (space, role) pair never has zero rows — which is what lets row
// presence unambiguously mean "this space customises this role".
const SPACE_MANDATORY_ACTIONS: readonly Action[] = [Action.EVENT_VIEW];

/** One event action as the per-space console renders it. */
export interface SpaceMatrixAction {
  key: Action;
  scope: RoleScope;
  /** false ⇒ shown but not toggleable (money = platform-locked, view = mandatory). */
  editable: boolean;
  /** Why it is locked, for the UI to explain. */
  locked?: 'money' | 'view';
}

/** One event role row in a space's matrix. */
export interface SpaceMatrixRole {
  code: RoleCode;
  /** true when this space has overridden this role (vs inheriting global). */
  customized: boolean;
  /** Effective action keys this role grants IN THIS SPACE. */
  grants: Action[];
}

export interface SpaceCapabilityMatrix {
  spaceId: string;
  actions: SpaceMatrixAction[];
  roles: SpaceMatrixRole[];
}

/** One row of the editable matrix, as the IAM console consumes it. */
export interface MatrixRole {
  code: RoleCode;
  scope: RoleScope;
  editable: boolean;
  note?: string;
  /** Action keys this role currently grants directly. */
  grants: Action[];
}

/** The whole matrix payload: the action catalogue plus every role row. */
export interface CapabilityMatrix {
  actions: Array<{ key: Action; scope: RoleScope }>;
  roles: MatrixRole[];
}

/**
 * Editable source of truth for the capability matrix — which actions each role
 * grants directly at its own scope.
 *
 * Rows live in `role_capabilities` (Platform-Admin editable via the Apex IAM
 * console); this service loads them into an in-memory map at boot so
 * `AuthorizationService` can answer `has(code, action)` *synchronously* on every
 * request — exactly the shape the old compiled `CAPABILITIES` constant had, but
 * now editable. This mirrors `PlanConfigService`, which did the same for plan
 * feature flags.
 *
 * Safety net: if a role has NO rows in the table (fresh/partial DB, or the
 * migration seed hasn't run), that role falls back to the compiled matrix. So
 * the platform is never left with an empty, deny-all matrix by accident.
 *
 * Cache scope: per-process, same trade-off as PlanConfigService. On a single
 * backend container an edit takes effect immediately (the controller calls
 * `reload()`); multi-instance deployments pick up changes on their next
 * `reload()` / restart. `ADMIN` never appears in this matrix — platform-admin
 * power is an inheritance rule in AuthorizationService, not a grant here.
 */
@Injectable()
export class CapabilityConfigService implements OnModuleInit {
  private readonly logger = new Logger(CapabilityConfigService.name);

  /** role code -> set of granted action strings. The live, in-memory matrix. */
  private cache = new Map<RoleCode, Set<string>>();

  /**
   * spaceId -> role -> set of granted actions. Per-space overrides. Sparse: only
   * spaces that have customised a role occupy any memory, so this stays small
   * even with many spaces.
   */
  private spaceOverrides = new Map<string, Map<RoleCode, Set<string>>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Re-read the whole matrix (global + per-space) from the DB. Call after any edit. */
  async reload(): Promise<void> {
    const [rows, spaceRows] = await Promise.all([
      this.prisma.roleCapability.findMany({
        select: { code: true, action: true },
      }),
      this.prisma.spaceRoleCapability.findMany({
        select: { spaceId: true, code: true, action: true },
      }),
    ]);

    const next = new Map<RoleCode, Set<string>>();
    for (const row of rows) {
      const set = next.get(row.code) ?? new Set<string>();
      set.add(row.action);
      next.set(row.code, set);
    }
    this.cache = next;

    const nextSpace = new Map<string, Map<RoleCode, Set<string>>>();
    for (const row of spaceRows) {
      const byRole =
        nextSpace.get(row.spaceId) ?? new Map<RoleCode, Set<string>>();
      const set = byRole.get(row.code) ?? new Set<string>();
      set.add(row.action);
      byRole.set(row.code, set);
      nextSpace.set(row.spaceId, byRole);
    }
    this.spaceOverrides = nextSpace;

    this.logger.log(
      `Loaded capability matrix: ${rows.length} global grants across ${next.size} roles; ` +
        `${spaceRows.length} per-space overrides across ${nextSpace.size} spaces`,
    );
  }

  /**
   * The set of actions `code` may perform directly. Returns the DB-backed set
   * when the role has any rows; otherwise falls back to the compiled matrix so a
   * missing seed never silently denies everything.
   */
  capabilitiesFor(code: RoleCode): ReadonlySet<string> {
    const fromDb = this.cache.get(code);
    if (fromDb && fromDb.size > 0) return fromDb;
    return new Set<string>(CAPABILITIES[code] ?? []);
  }

  /** True when `code` grants `action` directly (the hot-path check). */
  has(code: RoleCode, action: Action): boolean {
    return this.capabilitiesFor(code).has(action);
  }

  /**
   * True when `code` grants `action` in the context of `spaceId`, honouring any
   * per-space override. This is the check authorization uses on the hot path.
   *
   *   - Locked actions (money) always resolve through the GLOBAL matrix, so a
   *     per-space override can never grant or withhold them.
   *   - Otherwise, if the space has overridden this role (has ≥1 row), the
   *     override set is authoritative; if not, it inherits the global matrix.
   */
  effectiveHas(
    spaceId: string | null | undefined,
    code: RoleCode,
    action: Action,
  ): boolean {
    if (spaceId && !SPACE_LOCKED_ACTIONS.includes(action)) {
      const override = this.spaceOverrides.get(spaceId)?.get(code);
      if (override && override.size > 0) return override.has(action);
    }
    return this.has(code, action);
  }

  // --- IAM console surface -------------------------------------------------

  /** The full editable matrix for the Apex IAM console. */
  getMatrix(): CapabilityMatrix {
    const actions = (Object.keys(ACTION_SCOPE) as Action[]).map((key) => ({
      key,
      scope: ACTION_SCOPE[key],
    }));

    const roles: MatrixRole[] = ROLE_CATALOGUE.map((meta) => ({
      code: meta.code,
      scope: meta.scope,
      editable: meta.editable,
      note: meta.note,
      grants: [...this.capabilitiesFor(meta.code)] as Action[],
    }));

    return { actions, roles };
  }

  /**
   * Grant or revoke a single (role, action) pair, then refresh the cache.
   *
   * Rejects anything that would be meaningless or dangerous:
   *   - editing a locked role (ADMIN) — its power is inheritance, not a grant;
   *   - an unknown action;
   *   - an action whose scope does not match the role's scope (it could never
   *     satisfy the direct-match check anyway, so allowing it would only mislead);
   *   - granting EMPLOYEE platform:manage or company:manage (escalation).
   */
  async setGrant(
    code: RoleCode,
    action: Action,
    granted: boolean,
  ): Promise<CapabilityMatrix> {
    const meta = ROLE_CATALOGUE.find((r) => r.code === code);
    if (!meta) {
      throw new BadRequestException(`Unknown or unmanaged role: ${code}`);
    }
    if (!meta.editable) {
      throw new BadRequestException(
        `${code} is locked: its access is granted by inheritance, not this matrix.`,
      );
    }
    const actionScope = ACTION_SCOPE[action];
    if (!actionScope) {
      throw new BadRequestException(`Unknown action: ${action}`);
    }
    if (actionScope !== meta.scope) {
      throw new BadRequestException(
        `Action ${action} (${actionScope}) cannot be granted to ${code} (${meta.scope}) — scopes must match.`,
      );
    }
    if (
      granted &&
      code === RoleCode.EMPLOYEE &&
      EMPLOYEE_NEVER_GRANTABLE.includes(action)
    ) {
      throw new BadRequestException(
        `${action} can never be granted to ${code}.`,
      );
    }

    if (granted) {
      await this.prisma.roleCapability.upsert({
        where: { code_action: { code, action } },
        update: {},
        create: { code, action },
      });
    } else {
      await this.prisma.roleCapability.deleteMany({ where: { code, action } });
    }

    await this.reload();
    return this.getMatrix();
  }

  // --- IAM for Spaces (per-space overrides) --------------------------------

  /** The per-space matrix a Space Admin edits: event roles × event actions. */
  getSpaceMatrix(spaceId: string): SpaceCapabilityMatrix {
    const actions: SpaceMatrixAction[] = (Object.keys(ACTION_SCOPE) as Action[])
      .filter((key) => ACTION_SCOPE[key] === RoleScope.EVENT)
      .map((key) => ({
        key,
        scope: RoleScope.EVENT,
        editable:
          !SPACE_LOCKED_ACTIONS.includes(key) &&
          !SPACE_MANDATORY_ACTIONS.includes(key),
        locked: SPACE_LOCKED_ACTIONS.includes(key)
          ? ('money' as const)
          : SPACE_MANDATORY_ACTIONS.includes(key)
            ? ('view' as const)
            : undefined,
      }));

    const roles: SpaceMatrixRole[] = SPACE_OVERRIDABLE_ROLES.map((code) => ({
      code,
      customized: (this.spaceOverrides.get(spaceId)?.get(code)?.size ?? 0) > 0,
      grants: actions
        .filter((a) => this.effectiveHas(spaceId, code, a.key))
        .map((a) => a.key),
    }));

    return { spaceId, actions, roles };
  }

  /**
   * Grant or revoke one (role, action) for a single space, then refresh.
   *
   * Guardrails mirror the platform console plus the two space-specific policies:
   *   - only CURATOR / CO_CURATOR / CREW are overridable (SPACE_ADMIN is locked);
   *   - money and view are not toggleable (platform-controlled / mandatory);
   *   - action must be event-scoped.
   *
   * Materialise-on-customise: the first edit to a role in a space seeds that
   * role's whole current (mandatory + editable) grant set, so toggling one
   * action never silently drops the rest. `event:view` is always seeded, so a
   * customised role can never collapse to "zero rows" (which would read as
   * "inherit global").
   */
  async setSpaceGrant(
    spaceId: string,
    code: RoleCode,
    action: Action,
    granted: boolean,
  ): Promise<SpaceCapabilityMatrix> {
    if (!SPACE_OVERRIDABLE_ROLES.includes(code)) {
      throw new BadRequestException(
        `${code} cannot be customised per-space. Only Curator, Co-Curator and Crew are.`,
      );
    }
    const actionScope = ACTION_SCOPE[action];
    if (!actionScope) {
      throw new BadRequestException(`Unknown action: ${action}`);
    }
    if (actionScope !== RoleScope.EVENT) {
      throw new BadRequestException(
        `Only event actions can be customised per-space; ${action} is ${actionScope}.`,
      );
    }
    if (SPACE_LOCKED_ACTIONS.includes(action)) {
      throw new BadRequestException(
        `${action} is platform-controlled and cannot be changed per-space.`,
      );
    }
    if (SPACE_MANDATORY_ACTIONS.includes(action)) {
      throw new BadRequestException(
        `${action} is mandatory for this role and cannot be removed.`,
      );
    }

    // Materialise the role's current effective set on first customisation.
    const existing = await this.prisma.spaceRoleCapability.findMany({
      where: { spaceId, code },
      select: { action: true },
    });
    if (existing.length === 0) {
      const base = new Set<string>(SPACE_MANDATORY_ACTIONS);
      for (const a of this.capabilitiesFor(code)) {
        if (
          ACTION_SCOPE[a as Action] === RoleScope.EVENT &&
          !SPACE_LOCKED_ACTIONS.includes(a as Action)
        ) {
          base.add(a);
        }
      }
      await this.prisma.spaceRoleCapability.createMany({
        data: [...base].map((a) => ({ spaceId, code, action: a })),
        skipDuplicates: true,
      });
    }

    if (granted) {
      await this.prisma.spaceRoleCapability.upsert({
        where: { spaceId_code_action: { spaceId, code, action } },
        update: {},
        create: { spaceId, code, action },
      });
    } else {
      await this.prisma.spaceRoleCapability.deleteMany({
        where: { spaceId, code, action },
      });
    }

    await this.reload();
    return this.getSpaceMatrix(spaceId);
  }

  /** Drop all overrides for a role in a space — it reverts to the global matrix. */
  async resetSpaceRole(
    spaceId: string,
    code: RoleCode,
  ): Promise<SpaceCapabilityMatrix> {
    if (!SPACE_OVERRIDABLE_ROLES.includes(code)) {
      throw new BadRequestException(`${code} has no per-space overrides.`);
    }
    await this.prisma.spaceRoleCapability.deleteMany({ where: { spaceId, code } });
    await this.reload();
    return this.getSpaceMatrix(spaceId);
  }
}
