import { ForbiddenException } from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { Action } from '../auth/authorization';
import { PayoutsService } from './payouts.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { SubjectCases, SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';

/**
 * D22: a payout request and a payout-account review each open (or update) one
 * Platform REQUEST case. The case only wraps them: amounts, statuses and the
 * S23 money check are the same as without it.
 */
function setup() {
  const payouts: any[] = [];
  const account = {
    id: 'acct-1',
    userId: 'creator',
    methodType: 'BANK',
    bankName: 'HDFC',
    accountNumber: '50100012345678',
    upiId: null,
    accountHolderName: 'Asha',
    user: { fullName: 'Asha', identities: [] },
  };
  const db: any = {
    space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) }, // J16 live-space gate
    event: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, title: 'Hack Day', createdBy: 'creator', spaceId: 'sp-1', payoutBankAccountId: null, space: { subscription: null } })),
      findMany: jest.fn(async () => [{ id: 'ev-1' }]),
    },
    eventRegistration: { findMany: jest.fn(async () => [{ totalAmount: 1000, processingFee: 0, refundedAmount: 0, paymentStatus: 'PAID' }]) },
    userRole: { findMany: jest.fn(async () => []) },
    stayBooking: { findMany: jest.fn(async () => []) },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    refundRequest: { findMany: jest.fn(async () => []) },
    payoutBankAccount: {
      findFirst: jest.fn(async () => ({ id: 'acct-1', userId: 'creator' })),
      findUnique: jest.fn(async () => ({ ...account, status: 'VERIFIED' })),
      update: jest.fn(async ({ data }: any) => ({ ...account, ...data })),
    },
    payout: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async ({ where }: any) => payouts.find((p) => p.id === where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `p${payouts.length}`, ...data, event: { title: 'Hack Day' } };
        payouts.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(payouts.find((p) => p.id === where.id), data)),
    },
    $executeRaw: jest.fn(),
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const authz = { can: jest.fn(async (_u: unknown, a: Action) => a === Action.EVENT_MANAGE_MONEY) };
  const events: any = { emit: jest.fn() };
  const email = { sendBankAccountRejected: jest.fn(async () => undefined), sendRawEmail: jest.fn(async () => undefined) };
  const service = new PayoutsService(db, email as any, authz as any, new PlanConfigService({} as any), events);
  return { service, db, payouts, events, authz };
}

const emitted = (events: any, name: string) => events.emit.mock.calls.filter((c: any[]) => c[0] === name).map((c: any[]) => c[1]);

describe('payout request ↔ Assist case (D22)', () => {
  it('opens one Platform REQUEST case and resolves it when paid; the payout is unchanged', async () => {
    const { service, payouts, events } = setup();
    const payout = await service.requestPayout('curator', 'ev-1');
    expect(payout).toMatchObject({ netAmount: 1000, status: PayoutStatus.PENDING, bankAccountId: 'acct-1', platformFee: 0 });

    expect(emitted(events, SUBJECT_CASE_OPEN)).toEqual([
      expect.objectContaining({
        subjectType: 'Payout',
        subjectId: 'p0',
        requesterId: 'curator',
        kind: 'REQUEST',
        requestType: 'PAYOUT',
        desk: 'PLATFORM',
        spaceId: 'sp-1',
        eventId: 'ev-1',
        message: 'Please pay out ₹1000.00 for Hack Day.',
      }),
    ]);

    await service.markPayoutPaid('p0', { utr: 'UTR999999' } as any, 'admin');
    expect(payouts[0]).toMatchObject({ status: PayoutStatus.COMPLETED, utr: 'UTR999999' });
    expect(emitted(events, SUBJECT_CASE_UPDATE)).toEqual([
      expect.objectContaining({ subjectType: 'Payout', subjectId: 'p0', actorId: 'admin', text: 'Unifesto paid ₹1000.00. UTR UTR999999.', status: 'RESOLVED' }),
    ]);
  });

  it('a refused request (S23) opens no case and creates no payout', async () => {
    const { service, db, events, authz } = setup();
    authz.can.mockResolvedValue(false);
    await expect(service.requestPayout('creator', 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.payout.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('an admin-created payout (not a request) opens no case', async () => {
    const { service, events } = setup();
    await service.createEventPayout('ev-1', 'admin');
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('payout account review ↔ Assist case (D22)', () => {
  it('a rejection opens the case (idempotent) and posts the reason; the account update is unchanged', async () => {
    const { service, db, events } = setup();
    await service.updateBankAccountStatus('acct-1', { status: 'REJECTED', rejectionReason: 'Name mismatch' }, 'admin');
    expect(db.payoutBankAccount.update).toHaveBeenCalledWith({
      where: { id: 'acct-1' },
      data: { status: 'REJECTED', verifiedAt: null, verifiedBy: null, rejectionReason: 'Name mismatch' },
    });
    expect(emitted(events, SUBJECT_CASE_OPEN)).toEqual([
      expect.objectContaining({ subjectType: 'PayoutBankAccount', subjectId: 'acct-1', requesterId: 'creator', requestType: 'BANK_ACCOUNT', desk: 'PLATFORM' }),
    ]);
    expect(emitted(events, SUBJECT_CASE_UPDATE)).toEqual([
      expect.objectContaining({ subjectId: 'acct-1', actorId: 'admin', text: 'Unifesto rejected this payout account. Reason: Name mismatch', status: 'RESOLVED' }),
    ]);
  });

  it('the adapter keeps it to one case: open is a no-op when it exists, the review lands on it', async () => {
    const ticket = { id: 'case-1', requesterId: 'creator', desk: 'PLATFORM' };
    const prisma: any = {
      supportTicket: { findFirst: jest.fn(async () => ticket), create: jest.fn(), update: jest.fn() },
      supportMessage: { create: jest.fn() },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const { service, events } = setup();
    await service.updateBankAccountStatus('acct-1', { status: 'REJECTED', rejectionReason: 'Name mismatch' }, 'admin');
    const cases = new SubjectCases(prisma);
    await cases.onOpen(emitted(events, SUBJECT_CASE_OPEN)[0]);
    await cases.onUpdate(emitted(events, SUBJECT_CASE_UPDATE)[0]);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.supportMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.supportMessage.create.mock.calls[0][0].data).toMatchObject({ ticketId: 'case-1', side: 'SYSTEM', authorId: 'admin' });
  });
});
