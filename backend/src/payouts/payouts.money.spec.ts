import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PayoutStatus, Prisma } from '@prisma/client';
import { Action } from '../auth/authorization';
import { PayoutsService } from './payouts.service';
import { PlanConfigService } from '../subscription/plan-config.service';

/**
 * S12: payout creation is serialised per event, status changes only leave
 * PENDING once, and an overdrawn event shows how far it is overdrawn.
 * S23: payout request / routing need the money capability, not creatorship.
 * A20: an overdrawn event holds back the space's other payouts; admin picks an
 * eligible account only.
 */

const notFound = () => new Prisma.PrismaClientKnownRequestError('no match', { code: 'P2025', clientVersion: '6' });

function setup(
  opts: {
    paid?: number;
    /** Paid revenue per event of space sp-1 (A20); `paid` is ev-1's otherwise. */
    paidByEvent?: Record<string, number>;
    payouts?: { netAmount: number; status: PayoutStatus; eventId?: string }[];
  } = {},
) {
  const payouts = [...(opts.payouts ?? [])].map((p, i) => ({ id: `p${i}`, eventId: 'ev-1', ...p }));
  const paidFor = (eventId: string) => opts.paidByEvent?.[eventId] ?? opts.paid ?? 1000;
  const eventMatch = (id: string, w: any) => w == null || (typeof w === 'string' ? id === w : id !== w.not);
  // A per-event lock a real advisory lock would give: held until the tx ends.
  let lock: Promise<void> = Promise.resolve();
  const db: any = {
    space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) }, // J16 live-space gate
    event: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, createdBy: 'creator', spaceId: 'sp-1', payoutBankAccountId: null, space: { subscription: null } })),
      findMany: jest.fn(async ({ where }: any) =>
        Object.keys(opts.paidByEvent ?? { 'ev-1': 0 }).filter((id) => eventMatch(id, where.id)).map((id) => ({ id })),
      ),
    },
    eventRegistration: {
      findMany: jest.fn(async ({ where }: any) => [{ totalAmount: paidFor(where.eventId), processingFee: 0, refundedAmount: 0, paymentStatus: 'PAID' }]),
    },
    userRole: { findMany: jest.fn(async () => [{ userId: 'space-admin' }]) },
    stayBooking: { findMany: jest.fn(async () => []) },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    refundRequest: { findMany: jest.fn(async () => []) },
    payoutBankAccount: {
      findFirst: jest.fn(async () => ({ id: 'acct-1' })),
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, userId: where.id === 'stranger-acct' ? 'stranger' : 'creator', status: 'VERIFIED' })),
    },
    payout: {
      findMany: jest.fn(async ({ where, distinct }: any) => {
        const rows = payouts.filter((p) => where.status.in.includes(p.status) && eventMatch(p.eventId, where.eventId));
        const seen = new Set<string>();
        return rows
          .filter((p) => !distinct || (!seen.has(p.eventId) && seen.add(p.eventId)))
          .map((p) => ({ netAmount: p.netAmount, eventId: p.eventId }));
      }),
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
  const service = new PayoutsService(db, {} as any, authz as any, new PlanConfigService({} as any));
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
    jest.spyOn(service as any, 'notifyPayoutContacts').mockResolvedValue(undefined); // its read would take a stale row
    db.payout.findUnique.mockResolvedValueOnce(stale).mockResolvedValueOnce(stale);
    await service.markPayoutPaid('p0', { utr: 'UTR000001' }, 'admin');
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

describe("an overdrawn event holds back the space's other payouts (A20)", () => {
  // ev-1: ₹1000 paid out, then refunds left ₹600 → overdrawn by ₹400.
  const overdrawn = { netAmount: 1000, status: PayoutStatus.COMPLETED, eventId: 'ev-1' };

  it('a full payout of another event nets the debt off and says why', async () => {
    const { service } = setup({ paidByEvent: { 'ev-1': 600, 'ev-2': 1000 }, payouts: [overdrawn] });
    await expect(service.createPayout({ eventId: 'ev-2', bankAccountId: 'acct-1' }, 'admin')).resolves.toMatchObject({ netAmount: 600 });
  });

  it('a custom amount past the netted ceiling is refused with the reason', async () => {
    const { service, db } = setup({ paidByEvent: { 'ev-1': 600, 'ev-2': 1000 }, payouts: [overdrawn] });
    const err = await service.createPayout({ eventId: 'ev-2', bankAccountId: 'acct-1', netAmount: 700 }, 'admin').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('₹600.00');
    expect(err.message).toContain('overdrawn by ₹400.00');
    expect(db.payout.create).not.toHaveBeenCalled();
  });

  it('a debt bigger than the event blocks it outright', async () => {
    const { service } = setup({ paidByEvent: { 'ev-1': 0, 'ev-2': 500 }, payouts: [overdrawn] });
    await expect(service.createPayout({ eventId: 'ev-2', bankAccountId: 'acct-1' }, 'admin')).rejects.toThrow(/overdrawn by ₹1000.00/);
  });

  it('the debt is held once across the space, not once per event', async () => {
    // Space Financials: −400 + 1000 + 1000 = ₹1600 left to pay out.
    const { service, payouts } = setup({ paidByEvent: { 'ev-1': 600, 'ev-2': 1000, 'ev-3': 1000 }, payouts: [overdrawn] });
    await service.createPayout({ eventId: 'ev-2', bankAccountId: 'acct-1' }, 'admin');
    await service.createPayout({ eventId: 'ev-3', bankAccountId: 'acct-1' }, 'admin');
    const fresh = payouts.filter((p) => p.eventId !== 'ev-1').map((p) => Number(p.netAmount));
    expect(fresh).toEqual([1000, 600]);
  });

  it('two events of the space paying out at once never pass the netted total', async () => {
    const { service, payouts } = setup({ paidByEvent: { 'ev-1': 600, 'ev-2': 1000, 'ev-3': 1000 }, payouts: [overdrawn] });
    await Promise.all([
      service.createPayout({ eventId: 'ev-2', bankAccountId: 'acct-1' }, 'a'),
      service.createPayout({ eventId: 'ev-3', bankAccountId: 'acct-1' }, 'b'),
    ]);
    expect(payouts.filter((p) => p.eventId !== 'ev-1').reduce((s, p) => s + Number(p.netAmount), 0)).toBe(1600);
  });

  it('takes the space lock as well as the event lock', async () => {
    const { service, db } = setup({ paid: 1000 });
    let tx: any;
    db.$transaction.mockImplementationOnce(async (fn: any) => fn((tx = { ...db, $executeRaw: jest.fn() })));
    await service.createPayout({ eventId: 'ev-1', bankAccountId: 'acct-1' }, 'admin');
    const keys = tx.$executeRaw.mock.calls.map((c: any[]) => c[1]);
    expect(keys).toEqual(['payout:ev-1', 'payout-space:sp-1']);
  });

  it('an admin cannot pay out to an account outside the event', async () => {
    const { service, db } = setup({ paid: 1000 });
    await expect(service.createPayout({ eventId: 'ev-1', bankAccountId: 'stranger-acct' }, 'admin')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.payout.create).not.toHaveBeenCalled();
  });
});
