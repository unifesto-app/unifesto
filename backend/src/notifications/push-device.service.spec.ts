import { PushDeviceService } from './push-device.service';

describe('PushDeviceService native push installs (C12)', () => {
  const dto = { token: 'b'.repeat(64), platform: 'ios', optedIn: true, apnsEnv: 'development' };

  const build = (oldRow: { id: string } | null, deleted = true) => {
    const prisma: any = {
      userPushDevice: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(oldRow),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const oneSignal: any = {
      deleteSubscription: jest.fn().mockResolvedValue(deleted),
      linkSubscriptionToExternalId: jest.fn(),
    };
    return { svc: new PushDeviceService(prisma, oneSignal), prisma, oneSignal };
  };

  it('stores the token (no OneSignal link) and marks a dev build sandbox', async () => {
    const { svc, prisma, oneSignal } = build(null);
    await expect(svc.register('u1', dto as any, 's1')).resolves.toEqual({ linked: true, replaced: true });
    const call = prisma.userPushDevice.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ token: dto.token });
    expect(call.create).toMatchObject({ token: dto.token, sandbox: true, userId: 'u1', sessionId: 's1' });
    expect(oneSignal.linkSubscriptionToExternalId).not.toHaveBeenCalled();
  });

  it("deletes the install's old OneSignal subscription so it never gets a push twice", async () => {
    const { svc, prisma, oneSignal } = build({ id: 'row-old' });
    await expect(svc.register('u1', { ...dto, replacesSubscriptionId: 'sub-old-123' } as any)).resolves.toEqual({
      linked: true,
      replaced: true,
    });
    expect(prisma.userPushDevice.findFirst.mock.calls[0][0].where).toEqual({ subscriptionId: 'sub-old-123', userId: 'u1' });
    expect(oneSignal.deleteSubscription).toHaveBeenCalledWith('sub-old-123');
    expect(prisma.userPushDevice.deleteMany).toHaveBeenCalledWith({ where: { id: 'row-old' } });
  });

  it('a duplicate report that loses the race to the first still succeeds (UNIFESTO-BACKEND-E)', async () => {
    const { svc, prisma } = build({ id: 'row-old' });
    // The row is gone: delete() throws (P2025), deleteMany() just counts 0.
    prisma.userPushDevice.delete.mockRejectedValue(new Error('No record was found for a delete.'));
    prisma.userPushDevice.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.register('u1', { ...dto, replacesSubscriptionId: 'sub-old-123' } as any)).resolves.toEqual({
      linked: true,
      replaced: true,
    });
  });

  it("never touches a subscription that isn't the caller's", async () => {
    const { svc, oneSignal } = build(null);
    await expect(svc.register('u1', { ...dto, replacesSubscriptionId: 'someone-else' } as any)).resolves.toMatchObject({ replaced: true });
    expect(oneSignal.deleteSubscription).not.toHaveBeenCalled();
  });

  it('keeps the old row and reports replaced: false while OneSignal refuses, so the app asks again', async () => {
    const { svc, prisma } = build({ id: 'row-old' }, false);
    await expect(svc.register('u1', { ...dto, replacesSubscriptionId: 'sub-old-123' } as any)).resolves.toMatchObject({ replaced: false });
    expect(prisma.userPushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it('sign-out removes the install by subscription id or token, only for the caller', async () => {
    const { svc, prisma } = build(null);
    await svc.unregister('u1', dto.token);
    expect(prisma.userPushDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', OR: [{ subscriptionId: dto.token }, { token: dto.token }] },
    });
  });
});
