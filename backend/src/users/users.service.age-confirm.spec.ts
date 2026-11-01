import { UsersService } from './users.service';

describe('UsersService.updateMe age confirmation (Z11)', () => {
  it('stamps ageConfirmedAt once on PATCH /users/me', async () => {
    const prisma: any = {
      user: {
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ username: 'u1', fullName: 'U' }),
        update: jest.fn().mockResolvedValue({ id: 'u1', createdAt: new Date(), ageConfirmedAt: new Date() }),
      },
    };
    const svc = new UsersService(prisma, { get: () => undefined } as any, {} as any);

    await svc.updateMe('u1', { ageConfirmed: true });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', ageConfirmedAt: null },
      data: { ageConfirmedAt: expect.any(Date) },
    });
  });
});

describe('UsersService.updateMe username (Q5)', () => {
  const build = (me: { username: string | null; fullName: string | null }, taken: string[] = []) => {
    const prisma: any = {
      user: {
        updateMany: jest.fn(),
        findUnique: jest.fn(async ({ where }: any) => (where.id ? me : taken.includes(where.username) ? { id: 'other' } : null)),
        update: jest.fn(async ({ data }: any) => ({ id: 'u1', createdAt: new Date(), ...data })),
      },
    };
    return { prisma, svc: new UsersService(prisma, { get: () => undefined } as any, {} as any) };
  };

  it('generates one from the first name saved on an account without one', async () => {
    const { prisma, svc } = build({ username: null, fullName: null });
    await svc.updateMe('u1', { fullName: 'Priya K. Rao' });
    expect(prisma.user.update.mock.calls[0][0].data.username).toMatch(/^priyakrao\d{4}$/);
  });

  it('falls back to "user" for a name with no latin letters', async () => {
    const { prisma, svc } = build({ username: null, fullName: 'ప్రియ' });
    await svc.updateMe('u1', { ageConfirmed: true });
    expect(prisma.user.update.mock.calls[0][0].data.username).toMatch(/^user\d{4}$/);
  });

  it('never replaces an existing username', async () => {
    const { prisma, svc } = build({ username: 'priya', fullName: 'Priya' });
    await svc.updateMe('u1', { fullName: 'Priya Rao' });
    expect(prisma.user.update.mock.calls[0][0].data.username).toBeUndefined();
  });
});
