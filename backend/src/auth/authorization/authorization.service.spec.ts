import { RoleCode, RoleScope } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { CapabilityConfigService } from './capability-config.service';
import { Action } from './actions';

/**
 * Unit tests for the central authorization decision. Prisma is faked: one stub
 * returns the caller's role assignments, another resolves an event's owning
 * space. This keeps the test about POLICY, not the database.
 *
 * Capabilities are supplied by a real CapabilityConfigService whose cache is
 * left empty (onModuleInit is never called here), so every role falls back to
 * the compiled matrix — the tests therefore pin the same direct-grant semantics
 * the shipped defaults encode, independent of any DB rows.
 */
describe('AuthorizationService', () => {
  const SPACE_A = 'space-a';
  const SPACE_B = 'space-b';
  const EVENT_IN_A = 'event-in-a';

  type Assignment = {
    code: RoleCode;
    scope: RoleScope;
    spaceId: string | null;
    eventId: string | null;
  };

  const build = (assignments: Assignment[]) => {
    const prisma = {
      userRole: {
        findMany: jest.fn().mockResolvedValue(
          assignments.map((a) => ({
            role: { code: a.code, scope: a.scope },
            spaceId: a.spaceId,
            eventId: a.eventId,
          })),
        ),
      },
      event: {
        findUnique: jest.fn().mockResolvedValue({ spaceId: SPACE_A }),
      },
    };
    const capabilities = new CapabilityConfigService(prisma as any);
    return new AuthorizationService(prisma as any, capabilities);
  };

  const user = { id: 'u1' };

  it('grants a Curator the actions in its matrix on its own event', async () => {
    const svc = build([
      { code: RoleCode.CURATOR, scope: RoleScope.EVENT, spaceId: null, eventId: EVENT_IN_A },
    ]);
    expect(await svc.can(user, Action.EVENT_PUBLISH, { eventId: EVENT_IN_A })).toBe(true);
    expect(await svc.can(user, Action.EVENT_MANAGE_MONEY, { eventId: EVENT_IN_A })).toBe(true);
  });

  it('denies a Co-Curator publish and money (not in its matrix)', async () => {
    const svc = build([
      { code: RoleCode.CO_CURATOR, scope: RoleScope.EVENT, spaceId: null, eventId: EVENT_IN_A },
    ]);
    expect(await svc.can(user, Action.EVENT_EDIT, { eventId: EVENT_IN_A })).toBe(true);
    expect(await svc.can(user, Action.EVENT_PUBLISH, { eventId: EVENT_IN_A })).toBe(false);
    expect(await svc.can(user, Action.EVENT_MANAGE_MONEY, { eventId: EVENT_IN_A })).toBe(false);
  });

  it('lets a Crew member only check in', async () => {
    const svc = build([
      { code: RoleCode.CREW, scope: RoleScope.EVENT, spaceId: null, eventId: EVENT_IN_A },
    ]);
    expect(await svc.can(user, Action.EVENT_CHECK_IN, { eventId: EVENT_IN_A })).toBe(true);
    expect(await svc.can(user, Action.EVENT_EDIT, { eventId: EVENT_IN_A })).toBe(false);
  });

  describe('inheritance policy', () => {
    it('Platform ADMIN is a superuser', async () => {
      const svc = build([
        { code: RoleCode.ADMIN, scope: RoleScope.PLATFORM, spaceId: null, eventId: null },
      ]);
      expect(await svc.can(user, Action.PLATFORM_MANAGE)).toBe(true);
      expect(await svc.can(user, Action.SPACE_MANAGE_BILLING, { spaceId: SPACE_A })).toBe(true);
      expect(await svc.can(user, Action.EVENT_MANAGE_MONEY, { eventId: EVENT_IN_A })).toBe(true);
    });

    it('Space Admin inherits every event action EXCEPT money on events in its space', async () => {
      const svc = build([
        { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: SPACE_A, eventId: null },
      ]);
      expect(await svc.can(user, Action.EVENT_EDIT, { eventId: EVENT_IN_A })).toBe(true);
      expect(await svc.can(user, Action.EVENT_PUBLISH, { eventId: EVENT_IN_A })).toBe(true);
      expect(await svc.can(user, Action.EVENT_CANCEL, { eventId: EVENT_IN_A })).toBe(true);
      expect(await svc.can(user, Action.EVENT_CHECK_IN, { eventId: EVENT_IN_A })).toBe(true);
      // the one exclusion:
      expect(await svc.can(user, Action.EVENT_MANAGE_MONEY, { eventId: EVENT_IN_A })).toBe(false);
    });

    it('Space Admin of a DIFFERENT space gets nothing on the event', async () => {
      const svc = build([
        { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: SPACE_B, eventId: null },
      ]);
      expect(await svc.can(user, Action.EVENT_EDIT, { eventId: EVENT_IN_A })).toBe(false);
    });
  });

  it('denies a user with no relevant role', async () => {
    const svc = build([
      { code: RoleCode.MEMBER, scope: RoleScope.SPACE, spaceId: SPACE_A, eventId: null },
    ]);
    expect(await svc.can(user, Action.SPACE_MANAGE_BILLING, { spaceId: SPACE_A })).toBe(false);
    expect(await svc.can(user, Action.EVENT_EDIT, { eventId: EVENT_IN_A })).toBe(false);
  });

  describe('EMPLOYEE (platform team member)', () => {
    const employee = () =>
      build([
        { code: RoleCode.EMPLOYEE, scope: RoleScope.PLATFORM, spaceId: null, eventId: null },
      ]);

    it('holds company and product view/edit by default', async () => {
      const svc = employee();
      for (const action of [
        Action.COMPANY_VIEW,
        Action.COMPANY_EDIT,
        Action.PRODUCT_VIEW,
        Action.PRODUCT_EDIT,
      ]) {
        expect(await svc.can(user, action)).toBe(true);
      }
    });

    it('does not see restricted items, manage company, or run the platform', async () => {
      const svc = employee();
      expect(await svc.can(user, Action.COMPANY_VIEW_RESTRICTED)).toBe(false);
      expect(await svc.can(user, Action.COMPANY_MANAGE)).toBe(false);
      expect(await svc.can(user, Action.PLATFORM_MANAGE)).toBe(false);
    });

    it('gets nothing in spaces or events', async () => {
      const svc = employee();
      expect(await svc.can(user, Action.SPACE_VIEW, { spaceId: SPACE_A })).toBe(false);
      expect(await svc.can(user, Action.EVENT_VIEW, { eventId: EVENT_IN_A })).toBe(false);
    });

    it('platformActions lists exactly the employee defaults', async () => {
      expect((await employee().platformActions(user)).sort()).toEqual(
        [
          Action.COMPANY_VIEW,
          Action.COMPANY_EDIT,
          Action.PRODUCT_VIEW,
          Action.PRODUCT_EDIT,
        ].sort(),
      );
    });

    it('Platform ADMIN inherits every company and product action', async () => {
      const svc = build([
        { code: RoleCode.ADMIN, scope: RoleScope.PLATFORM, spaceId: null, eventId: null },
      ]);
      for (const action of [
        Action.COMPANY_VIEW,
        Action.COMPANY_EDIT,
        Action.COMPANY_MANAGE,
        Action.COMPANY_VIEW_RESTRICTED,
        Action.PRODUCT_VIEW,
        Action.PRODUCT_EDIT,
      ]) {
        expect(await svc.can(user, action)).toBe(true);
      }
    });
  });

  describe('space:manage-email (outbound email capability)', () => {
    it('Space Admin holds it in their own space', async () => {
      const svc = build([
        { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: SPACE_A, eventId: null },
      ]);
      expect(await svc.can(user, Action.SPACE_MANAGE_EMAIL, { spaceId: SPACE_A })).toBe(true);
    });

    it('Curator holds it (runs their events end-to-end, incl. email)', async () => {
      const svc = build([
        { code: RoleCode.CURATOR, scope: RoleScope.SPACE, spaceId: SPACE_A, eventId: null },
      ]);
      expect(await svc.can(user, Action.SPACE_MANAGE_EMAIL, { spaceId: SPACE_A })).toBe(true);
    });

    it('Co-Curator and Crew do NOT hold it', async () => {
      const co = build([
        { code: RoleCode.CO_CURATOR, scope: RoleScope.SPACE, spaceId: SPACE_A, eventId: null },
      ]);
      const crew = build([
        { code: RoleCode.CREW, scope: RoleScope.SPACE, spaceId: SPACE_A, eventId: null },
      ]);
      expect(await co.can(user, Action.SPACE_MANAGE_EMAIL, { spaceId: SPACE_A })).toBe(false);
      expect(await crew.can(user, Action.SPACE_MANAGE_EMAIL, { spaceId: SPACE_A })).toBe(false);
    });

    it('does not leak across spaces (Curator of B cannot email A)', async () => {
      const svc = build([
        { code: RoleCode.CURATOR, scope: RoleScope.SPACE, spaceId: SPACE_B, eventId: null },
      ]);
      expect(await svc.can(user, Action.SPACE_MANAGE_EMAIL, { spaceId: SPACE_A })).toBe(false);
    });
  });

  describe('canAny (S34: one assignment load for a list of resources)', () => {
    const buildWithPrisma = (assignments: Assignment[]) => {
      const prisma = {
        userRole: {
          findMany: jest.fn().mockResolvedValue(
            assignments.map((a) => ({
              role: { code: a.code, scope: a.scope },
              spaceId: a.spaceId,
              eventId: a.eventId,
            })),
          ),
        },
        event: { findUnique: jest.fn().mockResolvedValue({ spaceId: SPACE_A }) },
      };
      const svc = new AuthorizationService(prisma as any, new CapabilityConfigService(prisma as any));
      return { svc, prisma };
    };

    it('grants when any resource matches and loads roles once', async () => {
      const { svc, prisma } = buildWithPrisma([
        { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: SPACE_B, eventId: null },
      ]);
      const spaces = ['s1', 's2', 's3', SPACE_B].map((spaceId) => ({ spaceId }));
      expect(await svc.canAny(user, Action.SPACE_CREATE_EVENT, spaces)).toBe(true);
      expect(prisma.userRole.findMany).toHaveBeenCalledTimes(1);
    });

    it('denies an empty list and a user with no roles without event lookups', async () => {
      const { svc, prisma } = buildWithPrisma([]);
      expect(await svc.canAny(user, Action.SPACE_CREATE_EVENT, [])).toBe(false);
      expect(await svc.can(user, Action.EVENT_EDIT, { eventId: EVENT_IN_A })).toBe(false);
      expect(prisma.event.findUnique).not.toHaveBeenCalled();
    });
  });
});
