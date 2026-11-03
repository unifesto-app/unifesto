import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RoleCode, RoleScope } from '@prisma/client';
import { SpacesService } from './spaces.service';
import { AuthorizationService, CapabilityConfigService } from '../auth/authorization';

/**
 * T2: adding, re-roling and removing space members go through `canAssign`.
 * A Space Admin manages Members and, co-admins being self-serve, other Space
 * Admins, but never themselves or the space owner. Real AuthorizationService.
 */
describe('space members follow canAssign (T2)', () => {
  const ACTORS: Record<string, { role: { code: RoleCode; scope: RoleScope }; spaceId: string | null; eventId: null }[]> = {
    padmin: [{ role: { code: RoleCode.ADMIN, scope: RoleScope.PLATFORM }, spaceId: null, eventId: null }],
    sadmin: [{ role: { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE }, spaceId: 's1', eventId: null }],
    member: [{ role: { code: RoleCode.MEMBER, scope: RoleScope.SPACE }, spaceId: 's1', eventId: null }],
  };
  const MEMBERSHIPS: Record<string, { userId: string; code: RoleCode }> = {
    'ur-admin2': { userId: 'admin2', code: RoleCode.SPACE_ADMIN },
    'ur-member2': { userId: 'member2', code: RoleCode.MEMBER },
    'ur-sadmin': { userId: 'sadmin', code: RoleCode.SPACE_ADMIN },
    'ur-owner': { userId: 'owner', code: RoleCode.SPACE_ADMIN },
  };

  const build = () => {
    const prisma: any = {
      space: { findUnique: jest.fn(async () => ({ id: 's1', name: 'Robotics', slug: 'robotics', createdBy: 'owner' })) },
      userRole: {
        findMany: jest.fn(async ({ where }: any) => ACTORS[where.userId] ?? []),
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async ({ where }: any) => {
          const m = MEMBERSHIPS[where.id];
          return m && { id: where.id, spaceId: 's1', userId: m.userId, role: { code: m.code } };
        }),
        create: jest.fn(async ({ data }: any) => ({ id: 'ur-new', ...data })),
        update: jest.fn(async () => ({})),
        delete: jest.fn(async () => ({})),
      },
      userCapabilityOverride: { findMany: jest.fn(async () => []) },
      role: { findFirst: jest.fn(async () => ({ id: 'role-id' })) },
      user: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, fullName: null, identities: [] })) },
    };
    const authz = new AuthorizationService(prisma, new CapabilityConfigService(prisma));
    const svc = new SpacesService(prisma, {} as any, {} as any, {} as any, {} as any, authz);
    return { svc, prisma };
  };

  it('a Space Admin adds and removes Members', async () => {
    const { svc, prisma } = build();
    await svc.addSpaceMember('s1', 'sadmin', 'newbie', RoleCode.MEMBER);
    expect(prisma.userRole.create).toHaveBeenCalled();
    await expect(svc.removeSpaceMember('s1', 'ur-member2', 'sadmin')).resolves.toEqual({ message: 'Member removed' });
  });

  it('a Space Admin makes, promotes, demotes and removes another Space Admin', async () => {
    const { svc, prisma } = build();
    await svc.addSpaceMember('s1', 'sadmin', 'newbie', RoleCode.SPACE_ADMIN);
    await svc.updateSpaceMemberRole('s1', 'ur-member2', 'sadmin', RoleCode.SPACE_ADMIN);
    await svc.updateSpaceMemberRole('s1', 'ur-admin2', 'sadmin', RoleCode.MEMBER);
    await svc.removeSpaceMember('s1', 'ur-admin2', 'sadmin');
    expect(prisma.userRole.create).toHaveBeenCalled();
    expect(prisma.userRole.update).toHaveBeenCalledTimes(2);
    expect(prisma.userRole.delete).toHaveBeenCalled();
  });

  it('a Space Admin never touches themselves or the space owner', async () => {
    const { svc, prisma } = build();
    await expect(svc.updateSpaceMemberRole('s1', 'ur-sadmin', 'sadmin', RoleCode.MEMBER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.removeSpaceMember('s1', 'ur-sadmin', 'sadmin')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.updateSpaceMemberRole('s1', 'ur-owner', 'sadmin', RoleCode.MEMBER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.removeSpaceMember('s1', 'ur-owner', 'sadmin')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userRole.update).not.toHaveBeenCalled();
    expect(prisma.userRole.delete).not.toHaveBeenCalled();
  });

  it('a Platform ADMIN makes and removes Space Admins', async () => {
    const { svc, prisma } = build();
    await svc.addSpaceMember('s1', 'padmin', 'newbie', RoleCode.SPACE_ADMIN);
    await svc.updateSpaceMemberRole('s1', 'ur-member2', 'padmin', RoleCode.SPACE_ADMIN);
    await svc.removeSpaceMember('s1', 'ur-admin2', 'padmin');
    expect(prisma.userRole.create).toHaveBeenCalled();
    expect(prisma.userRole.update).toHaveBeenCalled();
    expect(prisma.userRole.delete).toHaveBeenCalled();
  });

  it('a plain Member assigns nothing', async () => {
    const { svc } = build();
    await expect(svc.addSpaceMember('s1', 'member', 'newbie', RoleCode.MEMBER)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
