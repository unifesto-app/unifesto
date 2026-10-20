import { BadRequestException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { CapabilityConfigService } from './capability-config.service';
import { Action } from './actions';

/**
 * Guardrail tests for the editable matrix. The DB is faked; these pin the rules
 * that keep an IAM edit from doing something meaningless or dangerous — above
 * all, that the platform superuser (ADMIN) can never be edited into a corner.
 */
describe('CapabilityConfigService.setGrant', () => {
  const build = () => {
    const prisma = {
      roleCapability: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      spaceRoleCapability: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { svc: new CapabilityConfigService(prisma as any), prisma };
  };

  it('refuses to edit ADMIN (power is inheritance, not a grant)', async () => {
    const { svc, prisma } = build();
    await expect(
      svc.setGrant(RoleCode.ADMIN, Action.PLATFORM_MANAGE, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.roleCapability.upsert).not.toHaveBeenCalled();
    expect(prisma.roleCapability.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an action whose scope does not match the role', async () => {
    const { svc } = build();
    // CURATOR is EVENT-scoped; a SPACE action can never satisfy a direct match.
    await expect(
      svc.setGrant(RoleCode.CURATOR, Action.SPACE_MANAGE_MONEY, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unmanaged role (e.g. MEMBER)', async () => {
    const { svc } = build();
    await expect(
      svc.setGrant(RoleCode.MEMBER, Action.EVENT_CHECK_IN, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid grant and reloads', async () => {
    const { svc, prisma } = build();
    await svc.setGrant(RoleCode.CO_CURATOR, Action.EVENT_PUBLISH, true);
    expect(prisma.roleCapability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code_action: {
            code: RoleCode.CO_CURATOR,
            action: Action.EVENT_PUBLISH,
          },
        },
      }),
    );
    // reload() re-reads the table.
    expect(prisma.roleCapability.findMany).toHaveBeenCalled();
  });

  it('never grants EMPLOYEE platform:manage or company:manage (no escalation)', async () => {
    const { svc, prisma } = build();
    for (const action of [Action.PLATFORM_MANAGE, Action.COMPANY_MANAGE]) {
      await expect(
        svc.setGrant(RoleCode.EMPLOYEE, action, true),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.roleCapability.upsert).not.toHaveBeenCalled();
  });

  it('lets EMPLOYEE be granted company:view-restricted', async () => {
    const { svc, prisma } = build();
    await svc.setGrant(RoleCode.EMPLOYEE, Action.COMPANY_VIEW_RESTRICTED, true);
    expect(prisma.roleCapability.upsert).toHaveBeenCalled();
  });

  it('shows EMPLOYEE as an editable row with its defaults', () => {
    const { svc } = build();
    const row = svc.getMatrix().roles.find((r) => r.code === RoleCode.EMPLOYEE);
    expect(row?.editable).toBe(true);
    expect(row?.grants.sort()).toEqual(
      [
        Action.COMPANY_VIEW,
        Action.COMPANY_EDIT,
        Action.PRODUCT_VIEW,
        Action.PRODUCT_EDIT,
      ].sort(),
    );
  });

  it('revokes a grant via deleteMany', async () => {
    const { svc, prisma } = build();
    await svc.setGrant(RoleCode.CREW, Action.EVENT_CHECK_IN, false);
    expect(prisma.roleCapability.deleteMany).toHaveBeenCalledWith({
      where: { code: RoleCode.CREW, action: Action.EVENT_CHECK_IN },
    });
  });
});

/**
 * Per-space override guardrails ("IAM for Spaces"). These pin the two locked
 * policy decisions — Space Admin is not overridable, money stays platform-only —
 * plus the materialise-on-customise behaviour that keeps a customised role from
 * collapsing to "inherit global".
 */
describe('CapabilityConfigService.setSpaceGrant', () => {
  const SPACE = 'space-1';

  const build = (spaceRows: Array<{ action: string }> = []) => {
    const prisma = {
      roleCapability: { findMany: jest.fn().mockResolvedValue([]) },
      spaceRoleCapability: {
        findMany: jest
          .fn()
          // first call: setSpaceGrant's "already customised?" probe
          .mockResolvedValueOnce(spaceRows)
          // subsequent calls (reload): whole-table read
          .mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { svc: new CapabilityConfigService(prisma as any), prisma };
  };

  it('refuses to override SPACE_ADMIN', async () => {
    const { svc } = build();
    await expect(
      svc.setSpaceGrant(SPACE, RoleCode.SPACE_ADMIN, Action.EVENT_EDIT, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to toggle money (platform-controlled)', async () => {
    const { svc } = build();
    await expect(
      svc.setSpaceGrant(SPACE, RoleCode.CURATOR, Action.EVENT_MANAGE_MONEY, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to remove the mandatory view action', async () => {
    const { svc } = build();
    await expect(
      svc.setSpaceGrant(SPACE, RoleCode.CREW, Action.EVENT_VIEW, false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-event action', async () => {
    const { svc } = build();
    await expect(
      svc.setSpaceGrant(SPACE, RoleCode.CURATOR, Action.SPACE_MANAGE_MONEY, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('materialises the role set on first customisation (never money)', async () => {
    // CREW is not yet customised (no existing rows) → its full effective set is
    // seeded before the toggle. CREW globally has view + check-in, neither money.
    const { svc, prisma } = build([]);
    await svc.setSpaceGrant(SPACE, RoleCode.CREW, Action.EVENT_CHECK_IN, false);

    expect(prisma.spaceRoleCapability.createMany).toHaveBeenCalledTimes(1);
    const seeded: string[] = prisma.spaceRoleCapability.createMany.mock.calls[0][0].data.map(
      (r: { action: string }) => r.action,
    );
    expect(seeded).toEqual(
      expect.arrayContaining([Action.EVENT_VIEW, Action.EVENT_CHECK_IN]),
    );
    expect(seeded).not.toContain(Action.EVENT_MANAGE_MONEY);
    // then the actual revoke of check-in
    expect(prisma.spaceRoleCapability.deleteMany).toHaveBeenCalledWith({
      where: { spaceId: SPACE, code: RoleCode.CREW, action: Action.EVENT_CHECK_IN },
    });
  });

  it('does not re-materialise once a role is already customised', async () => {
    const { svc, prisma } = build([{ action: Action.EVENT_VIEW }]);
    await svc.setSpaceGrant(SPACE, RoleCode.CO_CURATOR, Action.EVENT_PUBLISH, true);
    expect(prisma.spaceRoleCapability.createMany).not.toHaveBeenCalled();
    expect(prisma.spaceRoleCapability.upsert).toHaveBeenCalled();
  });
});
