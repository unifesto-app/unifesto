import { PaymentStatus, Prisma, RegistrationStatus } from '@prisma/client';
import { stampGatewayFee } from './payments.service';
import { RegistrationPaymentsService } from '../registrations/registration-payments.service';
import { PayoutsService, platformTake } from '../payouts/payouts.service';
import { PlanConfigService } from '../subscription/plan-config.service';

/**
 * T11: Razorpay's fee + GST is stamped on the sale its payment paid (webhook
 * and reconcile), survives refunds, and comes out of platform earnings. The
 * GST / place-of-supply snapshot is a DB trigger (migration
 * 20261203150000_sale_tax_gateway_fees), checked against Postgres, not here.
 */

const d = (n: number) => new Prisma.Decimal(n);
// ₹104 sale: Razorpay's 2% is ₹2.08 + 18% GST ₹0.37, and its `fee` includes the GST.
const FEE = 245;
const TAX = 37;
const STAMP = { gatewayFeePaise: 208, gatewayTaxPaise: 37 };

/** A sale table that honours stampGatewayFee's where clause. */
const table = (rows: Record<string, unknown>[]) => ({
  updateMany: jest.fn(async ({ where, data }: any) => {
    const hit = rows.filter((r) => r.paymentId === where.paymentId && r.gatewayFeePaise == null);
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  }),
});

describe('stampGatewayFee (T11)', () => {
  it("splits Razorpay's GST-inclusive fee and fills either sale table by payment id", async () => {
    const prisma = {
      eventRegistration: { updateMany: jest.fn(async () => ({ count: 0 })) },
      groupSeatPurchase: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    await expect(stampGatewayFee(prisma as any, { id: 'pay_1', fee: FEE, tax: TAX })).resolves.toBe(1);
    const call = { where: { paymentId: 'pay_1', gatewayFeePaise: null }, data: STAMP };
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith(call);
    expect(prisma.groupSeatPurchase.updateMany).toHaveBeenCalledWith(call);
  });

  it('skips a payment Razorpay has not charged yet, but a ₹0 fee is a stamp', async () => {
    const regs = [{ paymentId: 'pay_1', gatewayFeePaise: null }];
    const prisma = { eventRegistration: table(regs), groupSeatPurchase: table([]) };
    await stampGatewayFee(prisma as any, { id: 'pay_1', fee: null, tax: null });
    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    await stampGatewayFee(prisma as any, { id: 'pay_1', fee: 0, tax: 0 });
    expect(regs[0]).toMatchObject({ gatewayFeePaise: 0, gatewayTaxPaise: 0 });
  });

  it('keeps the first stamp through a partial then a full refund and later captures', async () => {
    const sale: Record<string, unknown> = { paymentId: 'pay_1', gatewayFeePaise: null, paymentStatus: 'PAID' };
    const prisma = { eventRegistration: table([sale]), groupSeatPurchase: table([]) };
    await stampGatewayFee(prisma as any, { id: 'pay_1', fee: FEE, tax: TAX });
    Object.assign(sale, { paymentStatus: 'PARTIALLY_REFUNDED', refundedAmount: d(40) });
    await stampGatewayFee(prisma as any, { id: 'pay_1', fee: 999, tax: 99 }); // replay, other figures
    Object.assign(sale, { paymentStatus: 'REFUNDED', refundedAmount: d(100) });
    await stampGatewayFee(prisma as any, { id: 'pay_1', fee: 0, tax: 0 });
    expect(sale).toMatchObject(STAMP);
  });
});

describe('gateway fee from the webhook and reconcile (T11)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'reg-1',
    orderId: 'order_1',
    paymentId: null,
    paymentStatus: PaymentStatus.PENDING,
    status: RegistrationStatus.REGISTERED,
    totalAmount: d(104),
    processingFee: d(4),
    razorpayAmount: d(104),
    event: { id: 'e1', title: 'Pitch Arena', slug: 'pitch-arena' },
    user: { fullName: 'A', username: 'a', identities: [] },
    ...over,
  });

  const build = (reg: Record<string, unknown>, razorpay: Record<string, unknown> = {}) => {
    const prisma: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => reg),
        findFirst: jest.fn(async () => ({ id: 'reg-1' })),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      groupSeatPurchase: { updateMany: jest.fn(async () => ({ count: 0 })) },
      webhookEvent: { findUnique: jest.fn(async () => null), createMany: jest.fn(async () => ({ count: 1 })) },
    };
    const payments = {
      verifyWebhookSignature: () => true,
      fetchOrderNotes: jest.fn(async () => ({ registrationId: 'reg-1' })),
      refundIfDuplicate: jest.fn(async () => undefined),
      ...razorpay,
    };
    const svc = new RegistrationPaymentsService(
      prisma, // prisma
      {} as any, // emailService
      {} as any, // whatsappService
      { redis: { getClient: () => null } } as any, // cache
      payments as any, // payments
      {} as any, // waitlist
      {} as any, // groupSeats
      {} as any, // coupons
      { completeFromWebhook: jest.fn(async () => false) } as any, // teamChanges
      {} as any, // confirmations
      {} as any, // notify
    );
    const complete = jest.spyOn(svc as any, 'completeWebhookPayment').mockResolvedValue(undefined);
    return { svc, prisma, complete };
  };

  /** Calls that wrote the gateway stamp. */
  const stamps = (prisma: any) =>
    prisma.eventRegistration.updateMany.mock.calls.filter(([a]: any) => 'gatewayFeePaise' in a.data);

  const webhook = (event: string, entity: Record<string, unknown> = {}) =>
    JSON.stringify({
      event,
      payload: {
        payment: {
          entity: { id: 'pay_1', order_id: 'order_1', amount: 10400, currency: 'INR', fee: FEE, tax: TAX, notes: {}, ...entity },
        },
        refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', notes: {} } },
      },
    });

  it('payment.captured stamps after the sale is settled, so the row has the payment id', async () => {
    const { svc, prisma, complete } = build(row());
    await svc.handleRazorpayWebhook(webhook('payment.captured'), 'sig', 'evt_1');
    expect(complete).toHaveBeenCalledWith('reg-1', 'pay_1', 'order_1');
    expect(stamps(prisma)).toEqual([[{ where: { paymentId: 'pay_1', gatewayFeePaise: null }, data: STAMP }]]);
    expect(prisma.groupSeatPurchase.updateMany).toHaveBeenCalled();
    expect(complete.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.eventRegistration.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('stamps a sale the browser verify already marked PAID', async () => {
    const { svc, prisma, complete } = build(row({ paymentStatus: PaymentStatus.PAID, paymentId: 'pay_1' }));
    await svc.handleRazorpayWebhook(webhook('payment.captured'), 'sig', 'evt_2');
    expect(complete).not.toHaveBeenCalled();
    expect(stamps(prisma)).toHaveLength(1);
  });

  it('refund webhooks never touch the stamp', async () => {
    const { svc, prisma } = build(row({ paymentStatus: PaymentStatus.PAID, paymentId: 'pay_1' }));
    await svc.handleRazorpayWebhook(webhook('refund.processed'), 'sig', 'evt_3');
    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    expect(prisma.groupSeatPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('reconcile by order stamps the captured payment it settles', async () => {
    const fetchOrderPayments = jest.fn(async () => [
      { id: 'pay_1', status: 'captured', amount: 10400, amountRefunded: 0, fee: FEE, tax: TAX },
    ]);
    const { svc, prisma, complete } = build(row(), { fetchOrderPayments });
    await expect(svc.reconcilePendingPayment('reg-1')).resolves.toMatchObject({ newStatus: PaymentStatus.PAID });
    expect(complete).toHaveBeenCalled();
    expect(stamps(prisma)[0][0].data).toEqual(STAMP);
  });

  it('reconcile by payment id stamps from the fetched payment', async () => {
    const fetchPayment = jest.fn(async () => ({
      id: 'pay_1', orderId: 'order_1', status: 'captured', amount: 10400, amountRefunded: 0,
      currency: 'INR', notes: {}, fee: FEE, tax: TAX,
    }));
    const { svc, prisma } = build(row(), { fetchPayment });
    await svc.reconcilePendingPayment('reg-1', { paymentId: 'pay_1' });
    expect(stamps(prisma)[0][0].data).toEqual(STAMP);
  });

  it('a capture refunded in full before reconcile still carries the fee Razorpay kept', async () => {
    const fetchOrderPayments = jest.fn(async () => [
      { id: 'pay_1', status: 'refunded', amount: 10400, amountRefunded: 10000, fee: FEE, tax: TAX },
    ]);
    const { svc, prisma } = build(row(), { fetchOrderPayments });
    await expect(svc.reconcilePendingPayment('reg-1')).resolves.toMatchObject({ newStatus: PaymentStatus.REFUNDED });
    expect(prisma.eventRegistration.update.mock.calls[0][0].data.paymentId).toBe('pay_1');
    expect(stamps(prisma)[0][0].data).toEqual(STAMP);
  });

  it('a partly refunded capture left for a human is not stamped (the row has no payment yet)', async () => {
    const fetchOrderPayments = jest.fn(async () => [
      { id: 'pay_1', status: 'captured', amount: 10400, amountRefunded: 2000, fee: FEE, tax: TAX },
    ]);
    const { svc, prisma } = build(row(), { fetchOrderPayments });
    await expect(svc.reconcilePendingPayment('reg-1')).resolves.toMatchObject({ changed: false });
    expect(stamps(prisma)).toHaveLength(0);
  });
});

describe('platform earnings net of Razorpay (T11)', () => {
  it('platformTake subtracts the gateway fee + GST from fees kept', () => {
    expect(platformTake({ processingFees: 48, gatewayFees: 25 }, 10.5)).toEqual({
      gatewayFees: 25,
      platformEarnings: 33.5,
    });
  });

  const planConfig = () => new PlanConfigService({} as any);

  it('Apex Financials subtracts what Razorpay kept, refunded sales included', async () => {
    const ever = (sum: Record<string, unknown>) =>
      jest.fn(async (a: any) => (a._sum.gatewayFeePaise ? { _sum: sum } : { _sum: {} }));
    const prisma: any = {
      eventRegistration: {
        aggregate: ever({ totalAmount: d(1040), processingFee: d(40), gatewayFeePaise: 1765, gatewayTaxPaise: 318 }),
        groupBy: jest.fn(async () => []),
      },
      groupSeatPurchase: {
        aggregate: ever({ totalAmount: d(208), processingFee: d(8), gatewayFeePaise: 353, gatewayTaxPaise: 64 }),
        groupBy: jest.fn(async () => []),
      },
      payout: { aggregate: jest.fn(async () => ({ _sum: {} })) },
      refundRequest: { aggregate: jest.fn(async () => ({ _sum: {} })) },
      space: { findMany: jest.fn(async () => []) },
      event: { findMany: jest.fn(async () => [{ id: 'e1', spaceId: 's1' }]) },
    };
    const res = await new PayoutsService(prisma, {} as any, {} as any, planConfig()).getPlatformFinancials();
    expect(res.processingFees).toBe(48);
    expect(res.gatewayFees).toBe(25); // (1765 + 318 + 353 + 64) paise
    expect(res.platformEarnings).toBe(23);
    const where = prisma.eventRegistration.aggregate.mock.calls.find(([a]: any) => a._sum.gatewayFeePaise)[0].where;
    expect(where.paymentStatus.in).toEqual(
      expect.arrayContaining([PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED]),
    );
  });

  it("the breakdown nets each space's own gateway fees; unstamped sales count as 0", async () => {
    const ever = (rows: unknown[]) => jest.fn(async (a: any) => (a._sum?.gatewayFeePaise ? rows : []));
    const prisma: any = {
      eventRegistration: {
        groupBy: ever([
          { eventId: 'e1', _sum: { totalAmount: d(1040), processingFee: d(40), gatewayFeePaise: 1765, gatewayTaxPaise: 318 } },
          { eventId: 'e2', _sum: { totalAmount: d(260), processingFee: d(10), gatewayFeePaise: null, gatewayTaxPaise: null } },
        ]),
      },
      groupSeatPurchase: { groupBy: ever([]) },
      payout: { groupBy: jest.fn(async () => []) },
      refundRequest: { groupBy: jest.fn(async () => []) },
      space: {
        findMany: jest.fn(async () => [
          { id: 's1', name: 'One', slug: 'one', subscription: null },
          { id: 's2', name: 'Two', slug: 'two', subscription: null },
        ]),
      },
      event: {
        findMany: jest.fn(async () => [
          { id: 'e1', title: 'E1', slug: 'e1', spaceId: 's1', startDateTime: new Date() },
          { id: 'e2', title: 'E2', slug: 'e2', spaceId: 's2', startDateTime: new Date() },
        ]),
      },
    };
    const { totals, spaces } = await new PayoutsService(
      prisma, {} as any, {} as any, planConfig(),
    ).getPlatformFinancialsBreakdown();
    expect(spaces.map((s) => [s.gatewayFees, s.platformEarnings])).toEqual([
      [20.83, 19.17],
      [0, 10],
    ]);
    expect(totals).toMatchObject({ processingFees: 50, gatewayFees: 20.83, platformEarnings: 29.17 });
  });
});
