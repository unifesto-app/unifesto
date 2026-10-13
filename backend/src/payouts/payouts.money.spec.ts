import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PayoutStatus, Prisma } from '@prisma/client';
import { Action } from '../auth/authorization';
import { PayoutsService } from './payouts.service';

/**
 * S12: payout creation is serialised per event, status changes only leave
 * PENDING once, and an overdrawn event shows how far it is overdrawn.
 * S23: payout request / routing need the money capability, not creatorship.
 */

const notFound = () => new Prisma.PrismaClientKnownRequestError('no match', { code: 'P2025', clientVersion: '6' });

function setup(opts: { paid?: number; payouts?: { netAmount: number; status: PayoutStatus }[] } = {}) {
  const payouts = [...(opts.payouts ?? [])].map((p, i) => ({ id: `p${i}`, eventId: 'ev-1', ...p }));
  // A per-event lock a real advisory lock would give: held until the tx ends.
  let lock: Promise<void> = Promise.resolve();
  const db: any = {
    event: {
      findUnique: jest.fn(async () => ({ id: 'ev-1', createdBy: 'creator', spaceId: 'sp-1', payoutBankAccountId: null, space: { subscription: null } })),
    },
    eventRegistration: {
      findMany: jest.fn(async () => [{ totalAmount: opts.paid ?? 1000, processingFee: 0 }]),
    },
    stayBooking: { findMany: jest.fn(async () => []) },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    payoutBankAccount: { findFirst: jest.fn(async () => ({ id: 'acct-1' })) },
    payout: {
      findMany: jest.fn(async ({ where }: any) =>
        payouts.filter((p) => where.status.in.includes(p.status)).map((p) => ({ netAmount: p.netAmount })),
      ),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async ({ where }: any) => payouts.find((p) => p.id === where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `p${payouts.length}`, ...data };
        payouts.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = payouts.find((p) => p.id === where.id);
        if (!row || (where.status && row.status !== where.status)) throw notFound();
        Object.assign(row, data);
        return row;
      }),
    },
    $executeRaw: jest.fn(),
  };
  db.$transaction = jest.fn(async (fn: (tx: any) => unknown) => {
    let release!: () => void;
    const prev = lock;
    lock = new Promise((r) => (release = r));
    const tx = {
      ...db,
      $executeRaw: jest.fn(async () => {
        await prev; // pg_advisory_xact_lock: wait for the previous holder
      }),
    };
    try {
      return await fn(tx);
    } finally {
      release();
    }
  });
  const authz = { can: jest.fn(async (_u: unknown, _a: Action) => false) };
  const service = new PayoutsService(db, {} as any, authz as any);
  return { service, db, payouts, authz };
}

describe('payout creation is serialised per event (S12)', () => {
  it('two concurrent full-balance payouts: one succeeds, the other finds nothing left', async () => {
    const { service, payouts } = setup({ paid: 1000 });
    const dto = { eventId: 'ev-1', bankAccountId: 'acct-1' };
    const results = await Promise.allSettled([service.createPayout(dto, 'a'), service.createPayout(dto, 'b')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    expect(payouts.reduce((s, p) => s + Number(p.netAmount), 0)).toBe(1000);
  });
});

describe('payout status changes leave PENDING once (S12)', () => {
  it('cancel after a concurrent mark-paid is a 409 and the payout stays COMPLETED', async () => {
    const { service, db, payouts } = setup({ payouts: [{ netAmount: 500, status: PayoutStatus.PENDING }] });
    // Both admins loaded it while PENDING.
    const stale = { ...payouts[0] };
    db.payout.findUnique.mockResolvedValueOnce(stale).mockResolvedValueOnce(stale);
    await service.markPayoutPaid('p0', { utr: 'UTR1' } as any);
    await expect(service.cancelPayout('p0', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(payouts[0].status).toBe(PayoutStatus.COMPLETED);
  });
});

describe('overdrawn events are visible (S12)', () => {
  it('a refund after a payout shows as overdrawn instead of hiding behind available = 0', async () => {
    // ₹1000 paid out, then refunds left only ₹600 of paid revenue.
    const { service } = setup({ paid: 600, payouts: [{ netAmount: 1000, status: PayoutStatus.COMPLETED }] });
    const summary = await service.getEventPayoutSummary('ev-1');
    expect(summary.available).toBe(0);
    expect(summary.overdrawn).toBe(400);
    expect(await service.eventOverdrawn('ev-1')).toBe(400);
  });

  it('the financials roll-up carries overdrawn too', () => {
    const fin = (PayoutsService.prototype as any).buildFinancials(
      { collectedOverall: 1000, processingFees: 0, currentGross: 600 },
      { settled: 1000, pending: 0 },
      400,
      0,
    );
    expect(fin.available).toBe(0);
    expect(fin.overdrawn).toBe(400);
  });
});

describe('payout request needs the money capability (S23)', () => {
  it('the event creator without a money role is refused', async () => {
    const { service, db } = setup();
    await expect(service.requestPayout('creator', 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setEventPayoutAccount('creator', 'ev-1', null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getEligibleAccountsForEvent('ev-1', 'creator')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.payout.create).not.toHaveBeenCalled();
  });

  it("the event's curator (event money) may request", async () => {
    const { service, authz, db } = setup();
    authz.can.mockImplementation(async (_u: any, action: Action) => action === Action.EVENT_MANAGE_MONEY);
    db.payoutBankAccount.findFirst.mockResolvedValue({ id: 'acct-1', userId: 'creator' });
    await expect(service.requestPayout('curator', 'ev-1')).resolves.toMatchObject({ netAmount: 1000 });
  });
});
