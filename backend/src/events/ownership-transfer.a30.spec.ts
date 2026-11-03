import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentStatus, PayoutStatus, RoleCode } from '@prisma/client';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { PayoutsService } from '../payouts/payouts.service';
import { EventsService } from './events.service';

/**
 * A30: an event changes hands only with its money settled, and the
 * handover re-homes it: the acceptor is its organiser of record, the old
 * payout account is cleared, and the old space's event team is gone.
 */
function build() {
  const event = {
    id: 'ev-1', slug: 'fest', title: 'Fest', spaceId: 'sp-old', parentEventId: null, status: 'PUBLISHED',
    createdBy: 'old-creator', payoutBankAccountId: 'acct-old' as string | null,
    _count: { childEvents: 0 }, space: { subscription: null },
  };
  const roles = [
    { userId: 'old-creator', code: RoleCode.SPACE_ADMIN, spaceId: 'sp-old', eventId: null },
    { userId: 'new-admin', code: RoleCode.SPACE_ADMIN, spaceId: 'sp-new', eventId: null },
    { userId: 'new-crew', code: RoleCode.MEMBER, spaceId: 'sp-new', eventId: null },
    { userId: 'old-curator', code: RoleCode.MEMBER, spaceId: 'sp-old', eventId: null },
    { userId: 'old-curator', code: RoleCode.CURATOR, spaceId: null, eventId: 'ev-1' },
    { userId: 'new-crew', code: RoleCode.CREW, spaceId: null, eventId: 'ev-1' },
  ];
  let grants = [{ userId: 'old-curator', eventId: 'ev-1' }, { userId: 'new-crew', eventId: 'ev-1' }];
  let coHosts = [{ eventId: 'ev-1', spaceId: 'sp-new' }];
  const transfers: any[] = [];
  const sales: any[] = [];
  const payouts: { status: PayoutStatus; netAmount: number }[] = [];
  const accounts = [
    { id: 'acct-old', userId: 'old-creator', status: 'VERIFIED', isPrimary: true },
    { id: 'acct-new', userId: 'new-admin', status: 'VERIFIED', isPrimary: true },
  ];

  // Event roles carry no space: "outside" = no role row in the receiving space.
  const outside = (r: { userId: string; eventId: string | null }, w: any) =>
    r.eventId === w.eventId && !roles.some((m) => m.userId === r.userId && m.spaceId === w.user.roles.none.spaceId);
  const matches = (row: any, w: any) => Object.entries(w).every(([k, v]) => row[k] === v);
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => event),
      update: jest.fn(async ({ data }: any) => Object.assign(event, data)),
    },
    eventCoHost: {
      findFirst: jest.fn(async ({ where }: any) => coHosts.find((c) => c.spaceId === where.spaceId) ?? null),
      deleteMany: jest.fn(async ({ where }: any) => { coHosts = coHosts.filter((c) => c.spaceId !== where.spaceId); }),
    },
    eventOwnershipTransfer: {
      findFirst: jest.fn(async () => transfers.find((t) => t.status === 'PENDING') ?? null),
      create: jest.fn(async ({ data }: any) => {
        const t = { id: 't-1', status: 'PENDING', ...data, fromSpace: { name: 'Old' }, toSpace: { name: 'New' } };
        transfers.push(t);
        return t;
      }),
      update: jest.fn(async ({ data }: any) => Object.assign(transfers[0], data)),
    },
    userRole: {
      findMany: jest.fn(async ({ where }: any) =>
        roles.filter((r) => r.spaceId === where.spaceId && where.role.code.in.includes(r.code))),
      deleteMany: jest.fn(async ({ where }: any) => {
        const gone = roles.filter((r) => outside(r, where));
        gone.forEach((r) => roles.splice(roles.indexOf(r), 1));
      }),
    },
    eventCheckinAccess: {
      deleteMany: jest.fn(async ({ where }: any) => { grants = grants.filter((g) => !outside(g, where)); }),
    },
    eventRegistration: { findMany: jest.fn(async () => sales) },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    refundRequest: { findMany: jest.fn(async () => []) },
    payout: {
      count: jest.fn(async ({ where }: any) => payouts.filter((p) => p.status === where.status).length),
      findMany: jest.fn(async ({ where }: any) => payouts.filter((p) => where.status.in.includes(p.status))),
    },
    payoutBankAccount: {
      findFirst: jest.fn(async ({ where }: any) => accounts.find((a) => matches(a, where)) ?? null),
      findUnique: jest.fn(async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  // Space Admins manage settings of their own space; nothing else is asked here.
  const authz: any = {
    can: jest.fn(async ({ id }: any, _action: string, { spaceId }: any) =>
      roles.some((r) => r.userId === id && r.spaceId === spaceId && SPACE_ADMIN_ROLE_CODES.includes(r.code))),
  };
  const planConfig: any = { resolvePlatformFeePercent: () => 5 };
  const payoutsSvc = new PayoutsService(prisma, {} as any, authz, planConfig);
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const svc = new EventsService(
    prisma, {} as any, {} as any, cache, {} as any, planConfig, { emit: jest.fn() } as any, authz, undefined, payoutsSvc,
  );
  // A ₹100 ticket (+₹2 buyer fee) at a 5% organiser fee nets ₹95.
  const sell = () => sales.push({ paymentStatus: PaymentStatus.PAID, totalAmount: 102, processingFee: 2, refundedAmount: 0, platformFeePercent: 5 });
  const transfer = () => svc.requestOwnershipTransfer('old-creator', 'ev-1', 'sp-new');
  const accept = () => svc.acceptOwnershipTransfer('new-admin', 'ev-1');
  return { svc, payoutsSvc, event, roles, transfers, payouts, sell, transfer, accept, grants: () => grants, coHosts: () => coHosts };
}

describe('event ownership transfer re-homes money and roles (A30)', () => {
  it('refuses the request while sales are not paid out', async () => {
    const { transfer, sell, transfers } = build();
    sell();
    await expect(transfer()).rejects.toThrow(
      new BadRequestException("Settle this event's money before transferring it: ₹95.00 is not paid out yet."),
    );
    expect(transfers).toHaveLength(0);
  });

  it('refuses the request while a payout is still pending', async () => {
    const { transfer, sell, payouts } = build();
    sell();
    payouts.push({ status: PayoutStatus.PENDING, netAmount: 95 });
    await expect(transfer()).rejects.toThrow('a payout is still waiting to be paid');
  });

  it('refuses the accept when money arrived after the request, and changes nothing', async () => {
    const { transfer, accept, sell, event, transfers } = build();
    await transfer();
    sell();
    await expect(accept()).rejects.toThrow(
      "The host space must settle this event's money before the handover: ₹95.00 is not paid out yet.",
    );
    expect(event).toMatchObject({ spaceId: 'sp-old', createdBy: 'old-creator', payoutBankAccountId: 'acct-old' });
    expect(transfers[0].status).toBe('PENDING');
  });

  it('accepts a zero-sales event and re-homes it', async () => {
    const { transfer, accept, event, roles, transfers, grants, coHosts } = build();
    await transfer();
    await accept();
    expect(event).toMatchObject({ spaceId: 'sp-new', createdBy: 'new-admin', payoutBankAccountId: null });
    expect(transfers[0].status).toBe('ACCEPTED');
    expect(coHosts()).toHaveLength(0);
    // The old space's curator is off the team; the receiving space's crew stays.
    expect(roles.filter((r) => r.eventId).map((r) => r.userId)).toEqual(['new-crew']);
    expect(grants().map((g) => g.userId)).toEqual(['new-crew']);
  });

  it('accepts a fully paid-out event', async () => {
    const { transfer, accept, sell, payouts, event } = build();
    sell();
    payouts.push({ status: PayoutStatus.COMPLETED, netAmount: 95 });
    await transfer();
    await accept();
    expect(event.spaceId).toBe('sp-new');
  });

  it("after the handover, payouts never reach the old creator's account", async () => {
    const { transfer, accept, payoutsSvc } = build();
    await transfer();
    await accept();
    const source = await payoutsSvc['loadSource']({ eventId: 'ev-1' });
    await expect(payoutsSvc['resolveEventPayoutAccount'](source)).resolves.toMatchObject({ id: 'acct-new' });
    await expect(payoutsSvc['resolveEventPayoutAccount'](source, 'acct-old')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
