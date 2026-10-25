import { SpaceStatus, SpaceVisibility } from '@prisma/client';
import { SpacesService } from './spaces.service';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';

// J3: the public space page loaded every membership row with its user.
describe('SpacesService.getSpaceById membership load', () => {
  const build = () => {
    const prisma = {
      space: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          status: SpaceStatus.ACTIVE,
          visibility: SpaceVisibility.PUBLIC,
          userRoles: [],
          subscription: null,
          domains: [],
        }),
      },
      userRole: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    return { svc, prisma };
  };

  const rolesWhere = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.space.findUnique.mock.calls[0][0].include.userRoles.where;

  it('loads only the admin team for an anonymous viewer', async () => {
    const { svc, prisma } = build();
    await svc.getSpaceById('s1');
    expect(rolesWhere(prisma)).toEqual({
      OR: [{ role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } }],
    });
  });

  it('adds just my own rows when signed in', async () => {
    const { svc, prisma } = build();
    await svc.getSpaceById('s1', 'u1');
    expect(rolesWhere(prisma).OR).toContainEqual({ userId: 'u1' });
    expect(rolesWhere(prisma).OR).toHaveLength(2);
  });
});
