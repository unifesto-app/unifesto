import 'reflect-metadata';
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { PayoutStatus, Prisma } from '@prisma/client';
import { AddBankAccountDto, MarkPayoutPaidDto, RevokeBankAccountDto } from './dto';
import { PayoutsService } from './payouts.service';
import { PlanConfigService } from '../subscription/plan-config.service';

/**
 * A32: manual payouts. Mark paid needs a unique UTR and records who/when,
 * once; a verified account can be revoked unless an unpaid payout uses it;
 * one primary method per owner; payout-method formats are validated.
 */

const notFound = () => new Prisma.PrismaClientKnownRequestError('no match', { code: 'P2025', clientVersion: '6' });
const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  const payouts: any[] = [
    { id: 'p0', status: PayoutStatus.PENDING, netAmount: 500, notes: null, utr: null, bankAccountId: 'a1' },
    { id: 'p1', status: PayoutStatus.COMPLETED, netAmount: 200, notes: null, utr: 'HDFC00012345', bankAccountId: 'a1' },
  ];
  const accounts: any[] = [
    { id: 'a1', userId: 'u1', status: 'VERIFIED', isPrimary: true, accountHolderName: 'Asha', bankName: 'HDFC', accountNumber: '50100012345678', upiId: null },
    { id: 'a2', userId: 'u1', status: 'VERIFIED', isPrimary: false, accountHolderName: 'Asha', bankName: null, accountNumber: null, upiId: 'asha@okhdfc' },
    { id: 'a3', userId: 'u2', status: 'VERIFIED', isPrimary: true, accountHolderName: 'Ravi', bankName: 'SBI', accountNumber: '123456789', upiId: null },
  ];
  const match = (row: any, where: any) =>
    Object.entries(where).every(([k, v]: [string, any]) =>
      v && typeof v === 'object' ? ('not' in v ? row[k] !== v.not : 'in' in v ? v.in.includes(row[k]) : true) : row[k] === v,
    );
  const db: any = {
    payout: {
      findUnique: jest.fn(async ({ where }: any) => {
        const row = payouts.find((p) => p.id === where.id);
        if (!row) return null;
        return { ...row, event: { title: 'Hack Day', createdBy: 'u1', spaceId: 'sp-1' }, bankAccount: accounts[0] };
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        payouts.find((p) => p.id !== where.id.not && p.utr?.toLowerCase() === where.utr.equals.toLowerCase()) ?? null,
      ),
      count: jest.fn(async ({ where }: any) => payouts.filter((p) => match(p, where)).length),
      update: jest.fn(async ({ where, data }: any) => {
        const row = payouts.find((p) => p.id === where.id);
        if (!row || (where.status && row.status !== where.status)) throw notFound();
        return Object.assign(row, data);
      }),
    },
    payoutBankAccount: {
      findFirst: jest.fn(async ({ where }: any) => accounts.find((a) => match(a, where)) ?? null),
      findUnique: jest.fn(async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = accounts.filter((a) => match(a, where));
        rows.forEach((a) => Object.assign(a, data));
        return { count: rows.length };
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(accounts.find((a) => a.id === where.id), data)),
    },
    userRole: { findMany: jest.fn(async () => [{ userId: 'u2' }]) },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.map((id: string) => ({ fullName: id, identities: [{ email: `${id}@x.com` }] })),
      ),
    },
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const email = { sendRawEmail: jest.fn(async () => 'id') };
  const events = { emit: jest.fn() };
  const service = new PayoutsService(db, email as any, {} as any, new PlanConfigService({} as any), events as any);
  return { service, db, payouts, accounts, email };
}

describe('mark paid (A32)', () => {
  it('needs a 6 to 40 character UTR', async () => {
    const { service, db } = setup();
    for (const utr of ['', '   ', 'abc12', 'x'.repeat(41)]) {
      await expect(service.markPayoutPaid('p0', { utr }, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(db.payout.update).not.toHaveBeenCalled();
  });

  it('records the UTR, who marked it and when, and emails the contacts with the UTR', async () => {
    const { service, payouts, email } = setup();
    await service.markPayoutPaid('p0', { utr: '  ICIC0099887766 ' }, 'admin-1');
    expect(payouts[0]).toMatchObject({ status: PayoutStatus.COMPLETED, utr: 'ICIC0099887766', paidById: 'admin-1' });
    expect(payouts[0].paidAt).toBeInstanceOf(Date);
    await flush();
    const sent = email.sendRawEmail.mock.calls as unknown as [string, string, string][];
    expect(sent.map((c) => c[0]).sort()).toEqual(['u1@x.com', 'u2@x.com']);
    expect(sent[0][1]).toBe('Payout sent for Hack Day');
    expect(sent[0][2]).toContain('ICIC0099887766');
  });

  it('refuses a UTR already on another payout, in any case', async () => {
    const { service, payouts } = setup();
    await expect(service.markPayoutPaid('p0', { utr: 'hdfc00012345' }, 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(payouts[0].status).toBe(PayoutStatus.PENDING);
  });

  it('a second mark paid is a 409 and leaves the first one as it was', async () => {
    const { service, payouts } = setup();
    await service.markPayoutPaid('p0', { utr: 'FIRST12345' }, 'admin-1');
    await expect(service.markPayoutPaid('p0', { utr: 'SECOND12345' }, 'admin-2')).rejects.toBeInstanceOf(ConflictException);
    expect(payouts[0]).toMatchObject({ utr: 'FIRST12345', paidById: 'admin-1' });
  });

  it('a double click (both read PENDING) marks it once', async () => {
    const { service, db, payouts } = setup();
    const stale = { ...payouts[0] };
    db.payout.findUnique.mockResolvedValueOnce(stale).mockResolvedValueOnce(stale);
    const results = await Promise.allSettled([
      service.markPayoutPaid('p0', { utr: 'CLICK11111' }, 'admin'),
      service.markPayoutPaid('p0', { utr: 'CLICK22222' }, 'admin'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('a unique-index race on the UTR becomes a 409', async () => {
    const { service, db } = setup();
    db.payout.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }));
    await expect(service.markPayoutPaid('p0', { utr: 'RACE123456' }, 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancelling emails the contacts', async () => {
    const { service, email } = setup();
    await service.cancelPayout('p0', 'admin');
    await flush();
    expect((email.sendRawEmail.mock.calls as unknown as string[][])[0][1]).toBe('Payout cancelled for Hack Day');
  });
});

describe('revoke verification (A32)', () => {
  it('is blocked while an unpaid payout points at the account', async () => {
    const { service, accounts } = setup();
    await expect(service.revokeBankAccountVerification('a1', 'Name mismatch', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(accounts[0].status).toBe('VERIFIED');
  });

  it('sets the account unverified with the note once nothing unpaid uses it', async () => {
    const { service, accounts, payouts } = setup();
    payouts[0].status = PayoutStatus.CANCELLED;
    await service.revokeBankAccountVerification('a1', ' Name mismatch ', 'admin');
    expect(accounts[0]).toMatchObject({ status: 'PENDING', verifiedAt: null, verifiedBy: null, rejectionReason: 'Name mismatch' });
  });

  it('only a verified account can be revoked', async () => {
    const { service, accounts } = setup();
    accounts[2].status = 'PENDING';
    await expect(service.revokeBankAccountVerification('a3', 'Check again', 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('make primary (A32)', () => {
  it("keeps exactly one primary per owner and leaves other owners' alone", async () => {
    const { service, accounts } = setup();
    await service.setPrimaryBankAccount('u1', 'a2');
    expect(accounts.filter((a) => a.userId === 'u1' && a.isPrimary).map((a) => a.id)).toEqual(['a2']);
    expect(accounts[2].isPrimary).toBe(true);
  });

  it("can't make someone else's account primary", async () => {
    const { service } = setup();
    await expect(service.setPrimaryBankAccount('u1', 'a3')).rejects.toThrow('Bank account not found');
  });
});

describe('payout-method validators (A32)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = (metatype: unknown, value: unknown) => pipe.transform(value, { type: 'body', metatype: metatype as never });
  const bank = { accountHolderName: 'Asha Rao', mobileNumber: '9876543210', accountNumber: '50100012345678', ifscCode: 'hdfc0001234', bankName: 'HDFC Bank' };

  it('accepts a bank account (IFSC uppercased) and a UPI handle', async () => {
    await expect(body(AddBankAccountDto, bank)).resolves.toMatchObject({ ifscCode: 'HDFC0001234' });
    await expect(
      body(AddBankAccountDto, { methodType: 'UPI', accountHolderName: 'Asha', mobileNumber: '9876543210', upiId: 'asha.rao-1@okhdfc' }),
    ).resolves.toMatchObject({ upiId: 'asha.rao-1@okhdfc' });
  });

  it.each([
    ['IFSC without the 0', { ifscCode: 'HDFC1001234' }],
    ['short IFSC', { ifscCode: 'HDFC000123' }],
    ['8 digit account', { accountNumber: '12345678' }],
    ['19 digit account', { accountNumber: '1'.repeat(19) }],
    ['letters in account', { accountNumber: '50100A12345678' }],
    ['no bank name', { bankName: '' }],
  ])('rejects a bank account with %s', async (_label, patch) => {
    await expect(body(AddBankAccountDto, { ...bank, ...patch })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['asha', 'a@okhdfc', 'asha@ok1', 'asha@', '@okhdfc'])('rejects UPI %s', async (upiId) => {
    await expect(
      body(AddBankAccountDto, { methodType: 'UPI', accountHolderName: 'Asha', mobileNumber: '9876543210', upiId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the service checks the formats too', async () => {
    const { service } = setup();
    await expect(service.addBankAccount('u1', { ...bank, ifscCode: 'BAD' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addBankAccount('u1', { ...bank, methodType: 'UPI', upiId: 'nope' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mark paid and revoke bodies', async () => {
    await expect(body(MarkPayoutPaidDto, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(MarkPayoutPaidDto, { utr: ' 12345 ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(MarkPayoutPaidDto, { utr: ' 123456 ' })).resolves.toMatchObject({ utr: '123456' });
    await expect(body(RevokeBankAccountDto, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
