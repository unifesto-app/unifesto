import { CouponRedemptionStatus } from '@prisma/client';
import { CouponsService } from './coupons.service';

/** S15: a coupon's hard cap must not leak through the reservation lifecycle. */
describe('CouponsService reservations', () => {
  const build = (opts: { redemption?: any; deleted?: number; promoted?: number; reg?: any }) => {
    const tx: any = {
      couponRedemption: {
        findUnique: jest.fn(async () => opts.redemption ?? null),
        deleteMany: jest.fn(async () => ({ count: opts.deleted ?? 1 })),
        delete: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: opts.promoted ?? 0 })),
        create: jest.fn(async () => ({})),
      },
      eventRegistration: { findUnique: jest.fn(async () => opts.reg ?? null) },
      $executeRaw: jest.fn(async () => 1),
    };
    return { svc: new CouponsService({} as any), tx };
  };
  const reserved = { id: 'red-1', couponId: 'c-1', status: CouponRedemptionStatus.RESERVED };

  it('release gives the slot back once', async () => {
    const { svc, tx } = build({ redemption: reserved });
    await svc.releaseByRegistration(tx, 'reg-1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('release loses to a payment that confirmed the row meanwhile', async () => {
    const { svc, tx } = build({ redemption: reserved, deleted: 0 });
    await svc.releaseByRegistration(tx, 'reg-1');
    expect(tx.couponRedemption.deleteMany).toHaveBeenCalledWith({
      where: { id: 'red-1', status: CouponRedemptionStatus.RESERVED },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('a payment after the 30-minute release still counts the use', async () => {
    const { svc, tx } = build({ reg: { couponId: 'c-1', couponDiscount: 50, userId: 'u-1' } });
    await svc.confirmByRegistration(tx, 'reg-1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // slot re-taken
    expect(tx.couponRedemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        couponId: 'c-1',
        registrationId: 'reg-1',
        status: CouponRedemptionStatus.CONFIRMED,
      }),
    });
  });

  it('confirming a held reservation takes no extra slot', async () => {
    const { svc, tx } = build({ promoted: 1 });
    await svc.confirmByRegistration(tx, 'reg-1');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.couponRedemption.create).not.toHaveBeenCalled();
  });

  it('no coupon on the registration: nothing to confirm', async () => {
    const { svc, tx } = build({ reg: { couponId: null } });
    await svc.confirmByRegistration(tx, 'reg-1');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
