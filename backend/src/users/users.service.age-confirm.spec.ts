import { UsersService } from './users.service';

describe('UsersService.updateMe age confirmation (Z11)', () => {
  it('stamps ageConfirmedAt once on PATCH /users/me', async () => {
    const prisma: any = {
      user: {
        updateMany: jest.fn(),
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
