import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { assertEventSpaceAdmin, isPlatformAdmin, isSpaceAdmin } from './event-access';

function prismaWith(event: object | null, roleCount: number) {
  return {
    event: { findUnique: jest.fn().mockResolvedValue(event) },
    userRole: { count: jest.fn().mockResolvedValue(roleCount) },
  } as any;
}

describe('event-access gates', () => {
  it('404s for a missing event', async () => {
    const prisma = prismaWith(null, 1);
    await expect(assertEventSpaceAdmin(prisma, 'u1', 'e1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s with the caller message when the user is not a Space Admin', async () => {
    const prisma = prismaWith({ id: 'e1', spaceId: 's1' }, 0);
    await expect(assertEventSpaceAdmin(prisma, 'u1', 'e1', 'Only organisers')).rejects.toThrow(
      new ForbiddenException('Only organisers'),
    );
  });

  it('returns the event with the requested fields plus id and spaceId', async () => {
    const prisma = prismaWith({ id: 'e1', spaceId: 's1', title: 'T' }, 1);
    const event = await assertEventSpaceAdmin(prisma, 'u1', 'e1', 'x', { title: true });
    expect(event).toEqual({ id: 'e1', spaceId: 's1', title: 'T' });
    expect(prisma.event.findUnique).toHaveBeenCalledWith({
      where: { id: 'e1' },
      select: { title: true, id: true, spaceId: true },
    });
  });

  it('only counts space-scoped Space Admin roles on that space', async () => {
    const prisma = prismaWith(null, 0);
    expect(await isSpaceAdmin(prisma, 'u1', 's1')).toBe(false);
    expect(prisma.userRole.count).toHaveBeenCalledWith({
      where: { userId: 'u1', spaceId: 's1', eventId: null, role: { code: { in: [RoleCode.SPACE_ADMIN] } } },
    });
  });

  it('isPlatformAdmin is false without a user and checks the ADMIN role otherwise', async () => {
    const prisma = prismaWith(null, 1);
    expect(await isPlatformAdmin(prisma, undefined)).toBe(false);
    expect(prisma.userRole.count).not.toHaveBeenCalled();
    expect(await isPlatformAdmin(prisma, 'u1')).toBe(true);
    expect(prisma.userRole.count).toHaveBeenCalledWith({
      where: { userId: 'u1', role: { code: RoleCode.ADMIN } },
    });
  });
});
