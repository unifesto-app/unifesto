import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { Action } from '../auth/authorization';
import { assertEventCan, isPlatformAdmin } from './event-access';

function prismaWith(event: object | null, roleCount: number) {
  return {
    event: { findUnique: jest.fn().mockResolvedValue(event) },
    userRole: { count: jest.fn().mockResolvedValue(roleCount) },
  } as any;
}

const authzWith = (allowed: boolean) => ({ can: jest.fn().mockResolvedValue(allowed) }) as any;
const A = Action.EVENT_MANAGE_ATTENDEES;

describe('event-access gates', () => {
  it('404s for a missing event', async () => {
    const prisma = prismaWith(null, 1);
    await expect(assertEventCan(prisma, authzWith(true), 'u1', 'e1', A, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s with the caller message when the capability check refuses', async () => {
    const prisma = prismaWith({ id: 'e1', spaceId: 's1' }, 0);
    const authz = authzWith(false);
    await expect(assertEventCan(prisma, authz, 'u1', 'e1', A, 'Only organisers')).rejects.toThrow(
      new ForbiddenException('Only organisers'),
    );
    expect(authz.can).toHaveBeenCalledWith({ id: 'u1' }, A, { eventId: 'e1' });
  });

  it('returns the event with the requested fields plus id and spaceId', async () => {
    const prisma = prismaWith({ id: 'e1', spaceId: 's1', title: 'T' }, 1);
    const event = await assertEventCan(prisma, authzWith(true), 'u1', 'e1', A, 'x', { title: true });
    expect(event).toEqual({ id: 'e1', spaceId: 's1', title: 'T' });
    expect(prisma.event.findUnique).toHaveBeenCalledWith({
      where: { id: 'e1' },
      select: { title: true, id: true, spaceId: true },
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
