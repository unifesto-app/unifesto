import { PaymentStatus, Prisma, RegistrationStatus, SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';

/**
 * S50: a session seat is taken atomically (conditional UPDATE) on register and
 * verify; a payment that loses the race is cancelled and refunded in full.
 * S52: a row that ever took a payment is never revived by re-registering.
 */
describe('SessionsService session capacity', () => {
  const session = {
    id: 's-1',
    spaceId: 'sp-1',
    createdBy: 'host',
    status: SessionStatus.PUBLISHED,
    deletedAt: null,
    startDateTime: new Date(Date.now() + 86_400_000),
    capacity: 10,
    registeredCount: 9,
    price: new Prisma.Decimal(0),
  };
  const build = ({ seatTaken = 1, existing = null as any, row = {} as any } = {}) => {
    const regRow = {
      id: 'sr-1',
      sessionId: 's-1',
      userId: 'u-1',
      orderId: 'order_1',
      paymentId: 'pay_1',
      razorpayAmount: 102,
      processingFee: 0,
      paymentStatus: PaymentStatus.PENDING,
      status: RegistrationStatus.REGISTERED,
      ...row,
    };
    const prisma: any = {
      space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) }, // J16 live-space gate
      $executeRaw: jest.fn(async () => seatTaken),
      session: { findUnique: jest.fn(async () => session) },
      sessionRegistration: {
        findUnique: jest.fn(async (args: any) => (args.where.id ? regRow : existing)),
        findUniqueOrThrow: jest.fn(async () => regRow),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({})),
        create: jest.fn(async () => ({ id: 'sr-new' })),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { verifyPaymentSignature: jest.fn(() => true), refund: jest.fn(async () => undefined) };
    const svc = new SessionsService(prisma, payments as any, {} as any, {} as any, {} as any, { can: jest.fn().mockResolvedValue(true) } as any);
    jest.spyOn(svc as any, 'isSessionHost').mockResolvedValue(false);
    return { svc, prisma, payments };
  };
  const verify = (svc: SessionsService) =>
    svc.verifyPayment('u-1', {
      registrationId: 'sr-1',
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      razorpaySignature: 'sig',
    } as any);

  it('verify takes the seat with one conditional UPDATE', async () => {
    const { svc, prisma, payments } = build();
    await expect(verify(svc)).resolves.toEqual({ registrationId: 'sr-1', paid: true });
    const sql = prisma.$executeRaw.mock.calls[0][0].join('?');
    expect(sql).toMatch(/registered_count < capacity/);
    expect(sql).toMatch(/status = 'PUBLISHED'/);
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('verify that loses the last seat cancels the row and refunds the whole payment', async () => {
    const { svc, prisma, payments } = build({ seatTaken: 0 });
    await expect(verify(svc)).rejects.toThrow(/refunded in full/);
    expect(prisma.sessionRegistration.update).toHaveBeenCalledWith({
      where: { id: 'sr-1' },
      data: expect.objectContaining({
        status: RegistrationStatus.CANCELLED,
        refundDueAt: expect.any(Date),
        processingFee: new Prisma.Decimal(0),
      }),
    });
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 102, expect.any(String), expect.any(Object));
  });

  it('a free register that loses the last seat fails (transaction rolls back)', async () => {
    const { svc } = build({ seatTaken: 0 });
    await expect(svc.register('u-1', 's-1')).rejects.toThrow(/Session is full/);
  });

  it('a double-tapped free re-register counts the seat once', async () => {
    const existing = { id: 'sr-1', status: RegistrationStatus.CANCELLED, paymentId: null };
    const { svc, prisma } = build({ existing });
    prisma.sessionRegistration.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.register('u-1', 's-1')).rejects.toThrow(/Already registered/);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('never revives a refunded/cancelled row that took a payment', async () => {
    const existing = {
      id: 'sr-1',
      status: RegistrationStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      paymentId: 'pay_old',
    };
    const { svc, prisma } = build({ existing });
    await expect(svc.register('u-1', 's-1')).rejects.toThrow(/refunded/);
    expect(prisma.sessionRegistration.updateMany).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
