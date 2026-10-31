import { Prisma, RefundStatus } from '@prisma/client';
import { UsersService, privateFileKeys } from './users.service';
import { ERASED_NAME, REDACTED_REFUND_REASON, REDACTED_SUPPORT_MESSAGE } from '../common/account-deletion';

const cognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: cognitoSend })),
  ListUsersCommand: jest.fn((input) => ({ cmd: 'ListUsers', input })),
  AdminDeleteUserCommand: jest.fn((input) => ({ cmd: 'AdminDeleteUser', input })),
}));

/**
 * closeAccount's DPDP scrub: personal data on the user's registrations, group
 * seats and stay bookings goes, money fields and other people's data stay,
 * and referenced private uploads are deleted after the transaction.
 */

const USER = 'user-1';
const file = (key: string) => ({ key, name: 'x.pdf', size: 1, mime: 'application/pdf' });
const MY_FORM = 'private/form-uploads/ev1/f1/user-1/a.pdf';
const MY_MEMBER_FILE = 'private/form-uploads/ev2/f2/lead-2/m.pdf';
const MY_ID = 'private/form-uploads/ev1/stay-id-s1/user-1/id.jpg';

function makePrisma() {
  // Each write returns a tag so the test can see what went into $transaction.
  const op = (name: string) => jest.fn((args: unknown) => ({ name, args }));
  return {
    user: {
      findUnique: jest.fn(async () => ({
        id: USER,
        deletedAt: null,
        avatarUrl: 'https://bucket.s3.ap-south-1.amazonaws.com/avatars/user-1-2.jpg' as string | null,
        mobileNumber: '+919876543210',
        mobileVerified: true,
      })),
      update: op('user.update'),
    },
    eventRegistration: {
      findMany: jest.fn(async () => [
        {
          // The user's own group booking: they're the lead (seat 1).
          id: 'reg-own',
          formResponses: { q1: 'my phone 999', q2: file(MY_FORM) },
        },
      ]),
      updateMany: op('eventRegistration.updateMany'),
      update: op('eventRegistration.update'),
    },
    groupSeat: {
      findMany: jest.fn(async () => [
        // Seat 1 of their own group.
        { memberDetails: { name: 'Me' } },
        // Seat 3 in someone else's group.
        { memberDetails: { name: 'Me', customFields: { f2: file(MY_MEMBER_FILE) } } },
      ]),
      updateMany: op('groupSeat.updateMany'),
    },
    stayBooking: {
      findMany: jest.fn(async () => [
        { answers: { diet: 'veg' }, guests: [{ idProof: file(MY_ID) }, { idProof: null }] },
      ]),
      updateMany: op('stayBooking.updateMany'),
    },
    stayGuest: { updateMany: op('stayGuest.updateMany') },
    sponsorLead: { updateMany: op('sponsorLead.updateMany') },
    refundRequest: { updateMany: op('refundRequest.updateMany') },
    userIdentity: {
      findMany: jest.fn(async () => [
        { provider: 'EMAIL', providerUserId: 'me@example.com', email: 'Me@Example.com', emailVerified: true },
        { provider: 'GOOGLE', providerUserId: 'sub-google', email: 'me_work@work.in', emailVerified: true },
        // Unverified: never used to match anyone's data.
        { provider: 'APPLE', providerUserId: 'sub-apple', email: 'other@x.in', emailVerified: false },
      ]),
      deleteMany: op('d'),
    },
    lead: {
      // What a case-insensitive ILIKE could return: two real matches plus a
      // `_`-wildcard false positive that must be dropped.
      findMany: jest.fn(async () => [
        { id: 'lead-1', email: 'me@example.com' },
        { id: 'lead-2', email: 'ME@WORK.IN' },
        { id: 'lead-x', email: 'meXwork@work.in' },
      ]),
      updateMany: op('lead.updateMany'),
    },
    userPushDevice: { deleteMany: op('d') },
    authSession: { deleteMany: op('d') },
    adminDevice: { deleteMany: op('d') },
    notificationSettings: { deleteMany: op('d') },
    favoriteEvent: { deleteMany: op('d') },
    userRole: { deleteMany: op('d') },
    sponsorUser: { deleteMany: op('d') },
    payoutBankAccount: { deleteMany: op('payoutBankAccount.deleteMany') },
    event: { updateMany: op('event.updateMany') },
    eventTicket: {
      findMany: jest.fn(async () => [
        { id: 't-mine', attendeeEmail: null },
        { id: 't-member', attendeeEmail: 'ME@example.com' },
        // An ILIKE `_` false positive: someone else.
        { id: 't-other', attendeeEmail: 'meXwork@work.in' },
      ]),
      updateMany: op('eventTicket.updateMany'),
    },
    certificate: {
      findMany: jest.fn(async () => [
        { id: 'c-1', userId: USER, recipientEmail: null, verificationCode: 'v1' },
        { id: 'c-2', userId: null, recipientEmail: 'me@example.com', verificationCode: 'v2' },
        { id: 'c-x', userId: null, recipientEmail: 'meXwork@work.in', verificationCode: 'vx' },
      ]),
      updateMany: op('certificate.updateMany'),
    },
    whatsappConversation: {
      findMany: jest.fn(async () => [{ id: 'wa-1', waId: '919876543210' }]),
      deleteMany: op('whatsappConversation.deleteMany'),
    },
    supportAttachment: {
      findMany: jest.fn(async () => [{ key: 'private/support/t1/m1/a.png' }]),
      deleteMany: op('supportAttachment.deleteMany'),
    },
    supportTicket: { updateMany: op('supportTicket.updateMany') },
    supportMessage: { updateMany: op('supportMessage.updateMany') },
    userNotification: { deleteMany: op('userNotification.deleteMany') },
    messageDelivery: { deleteMany: op('messageDelivery.deleteMany') },
    $executeRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      name: '$executeRaw',
      args: { sql: strings.join('?'), values },
    })),
    eventCheckinAccess: { deleteMany: op('d') },
    sessionCoHost: { deleteMany: op('d') },
    // Phone-only leads whose last 10 digits match, as the SQL narrows them.
    $queryRaw: jest.fn(async () => [
      { id: 'lead-p1', phone: '+91 98 76 54 32 10' },
      // Typed with a trunk 0, with and without spacing: both are this user.
      { id: 'lead-p0', phone: '09876543210' },
      { id: 'lead-p0s', phone: ' 0 98765-43210' },
      // A trunk 0 in front of someone else's number.
      { id: 'lead-p0x', phone: '09876543211' },
      // The 00 international prefix: this user, and a US number.
      { id: 'lead-p00', phone: '0091 98765 43210' },
      { id: 'lead-p00x', phone: '001 212 9876543210' },
      // A US number ending in the same 10 digits: not this user.
      { id: 'lead-px', phone: '+1 212 9876543210' },
    ]),
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
}

describe('UsersService.closeAccount PII scrub', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { deleteObject: jest.Mock; deletePrefix: jest.Mock };
  let tx: Array<{ name: string; args: any }>;
  let result: { leftovers: string[] };

  const config: Record<string, string> = {
    COGNITO_USER_POOL_ID: 'pool-1',
    AWS_REGION: 'ap-south-1',
    S3_BUCKET_NAME: 'bucket',
  };

  beforeEach(async () => {
    prisma = makePrisma();
    storage = { deleteObject: jest.fn(async () => undefined), deletePrefix: jest.fn(async () => 0) };
    cognitoSend.mockReset();
    cognitoSend.mockImplementation(async (c: { cmd: string; input: { Filter?: string } }) =>
      c.cmd === 'ListUsers' ? { Users: [{ Username: `google_${c.input.Filter}` }] } : {},
    );
    const service = new UsersService(prisma as any, { get: (k: string) => config[k] } as any, storage as any);
    result = await (service as any).closeAccount(USER);
    tx = prisma.$transaction.mock.calls[0][0] as any;
  });

  const writes = (name: string) => tx.filter((w) => w.name === name).map((w) => w.args);

  it('nulls form answers and sponsor consent on the user’s own registrations, leaving money fields alone', () => {
    expect(writes('eventRegistration.updateMany')).toEqual([
      {
        where: { userId: USER },
        data: { formResponses: Prisma.DbNull, shareContactWithSponsors: false },
      },
    ]);
  });

  it('scrubs funnel leads matching a verified email exactly (any case) or the verified mobile', () => {
    expect(prisma.userIdentity.findMany).toHaveBeenCalledWith({
      where: { userId: USER },
      select: { provider: true, providerUserId: true, email: true, emailVerified: true, appleRefreshToken: true },
    });
    // The SQL narrows phone-only leads on the mobile's last 10 digits.
    expect((prisma.$queryRaw.mock.calls[0] as unknown[]).slice(1)).toEqual(['9876543210']);
    // me_work@work.in's `_` would match meXwork@ under ILIKE; only exact hits go,
    // and of the phone candidates only this user's +91 number (any format) does.
    expect(writes('lead.updateMany')).toEqual([
      {
        where: { id: { in: ['lead-1', 'lead-p1', 'lead-p0', 'lead-p0s', 'lead-p00'] } },
        data: { name: null, email: null, phone: null, message: null },
      },
    ]);
  });

  it('scrubs sponsor lead contacts and decided refund reasons on the user’s registrations', () => {
    expect(writes('sponsorLead.updateMany')).toEqual([
      {
        where: { registration: { userId: USER } },
        data: { name: null, email: null, phone: null, note: null },
      },
    ]);
    expect(writes('refundRequest.updateMany')).toEqual([
      {
        where: {
          registration: { userId: USER },
          status: { in: [RefundStatus.APPROVED, RefundStatus.REJECTED] },
        },
        data: { reason: REDACTED_REFUND_REASON },
      },
    ]);
  });

  it('never rewrites another registration: rosters live on seats (S42)', () => {
    expect(writes('eventRegistration.update')).toEqual([]);
  });

  it('scrubs claimed seats, the user’s stay bookings and their guests', () => {
    expect(writes('groupSeat.updateMany')).toEqual([
      { where: { claimedByUserId: USER }, data: { memberDetails: Prisma.DbNull, inviteEmail: null } },
    ]);
    expect(writes('stayBooking.updateMany')[0].data).toEqual({
      emergencyName: null,
      emergencyPhone: null,
      note: null,
      answers: Prisma.DbNull,
    });
    expect(writes('stayGuest.updateMany')[0]).toEqual({
      where: { booking: { userId: USER } },
      data: { name: ERASED_NAME, phone: null, email: null, idProof: Prisma.DbNull },
    });
  });

  it('deletes the user’s private files, support uploads and certificate files, nobody else’s', () => {
    const deleted = storage.deleteObject.mock.calls.map((c) => c[0]).sort();
    expect(deleted).toEqual(
      [
        MY_FORM,
        MY_MEMBER_FILE,
        MY_ID,
        'private/support/t1/m1/a.png',
        'certificates/v1.pdf',
        'certificates/v1.png',
        'certificates/v2.pdf',
        'certificates/v2.png',
        'avatars/user-1-2.jpg',
      ].sort(),
    );
  });

  it('keeps a paid-out bank account for the payout record, scrubbed; deletes the rest', () => {
    // Only accounts never paid out to are deleted (Payout.bankAccount is RESTRICT).
    expect(writes('payoutBankAccount.deleteMany')).toEqual([{ where: { userId: USER, payouts: { none: {} } } }]);
    expect(writes('event.updateMany')).toEqual([
      { where: { payoutBankAccount: { userId: USER } }, data: { payoutBankAccountId: null } },
    ]);
    const [raw] = writes('$executeRaw');
    expect(raw.sql).toContain('UPDATE organiser_bank_accounts');
    expect(raw.sql).toMatch(/account_number = CASE .* right\(account_number, 4\)/);
    expect(raw.sql).toContain('mobile_number = NULL');
    expect(raw.sql).not.toContain('ifsc_code');
    expect(raw.values).toEqual([ERASED_NAME, USER]);
    // The scrub runs after the delete, inside the same transaction.
    const names = tx.map((w) => w.name);
    expect(names.indexOf('$executeRaw')).toBeGreaterThan(names.indexOf('payoutBankAccount.deleteMany'));
  });

  it('erases the name on the user’s tickets and certificates, matched exactly', () => {
    expect(writes('eventTicket.updateMany')).toEqual([
      { where: { id: { in: ['t-mine', 't-member'] } }, data: { attendeeName: ERASED_NAME, attendeeEmail: null } },
    ]);
    expect(writes('certificate.updateMany')).toEqual([
      {
        where: { id: { in: ['c-1', 'c-2'] } },
        data: { recipientName: ERASED_NAME, recipientEmail: null, pdfUrl: null, imageUrl: null },
      },
    ]);
    // The unverified address is never a match key.
    const certWhere = JSON.stringify(prisma.certificate.findMany.mock.calls[0]);
    expect(certWhere).not.toContain('other@x.in');
  });

  it('scrubs the user’s side of support threads, keeping desk and system lines', () => {
    expect(writes('supportTicket.updateMany')).toEqual([
      {
        where: { requesterId: USER },
        data: { contactEmail: null, clientInfo: Prisma.DbNull, ratingComment: null, aiTriage: Prisma.DbNull, aiSummary: null },
      },
    ]);
    expect(writes('supportMessage.updateMany')).toEqual([
      { where: { authorId: USER, side: 'REQUESTER' }, data: { body: REDACTED_SUPPORT_MESSAGE } },
    ]);
    expect(writes('supportAttachment.deleteMany')).toEqual([
      { where: { message: { authorId: USER, side: 'REQUESTER' } } },
    ]);
  });

  it('deletes notifications, delivery logs and WhatsApp threads with their media', () => {
    expect(writes('userNotification.deleteMany')).toEqual([{ where: { userId: USER } }]);
    expect(writes('messageDelivery.deleteMany')).toEqual([{ where: { userId: USER } }]);
    expect(prisma.whatsappConversation.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: USER }, { waId: '919876543210' }] },
      select: { id: true, waId: true },
    });
    expect(writes('whatsappConversation.deleteMany')).toEqual([{ where: { id: { in: ['wa-1'] } } }]);
    expect(storage.deletePrefix.mock.calls.map((c) => c[0])).toEqual([
      'avatars/user-1-',
      'whatsapp-inbox/919876543210/',
      'whatsapp-outbound/919876543210/',
      'private/whatsapp-inbox/919876543210/',
      'private/whatsapp-outbound/919876543210/',
    ]);
  });

  it('deletes the Google and Apple users from the Cognito pool', () => {
    const deletes = cognitoSend.mock.calls.map((c) => c[0]).filter((c) => c.cmd === 'AdminDeleteUser');
    expect(deletes.map((c) => c.input)).toEqual([
      { UserPoolId: 'pool-1', Username: 'google_sub = "sub-google"' },
      { UserPoolId: 'pool-1', Username: 'google_sub = "sub-apple"' },
    ]);
    expect(result).toEqual({ leftovers: [] });
  });
});

describe('UsersService.closeAccount cleanup failures', () => {
  it('returns what could not be removed instead of failing the close', async () => {
    const prisma = makePrisma();
    cognitoSend.mockReset();
    cognitoSend.mockRejectedValue(new Error('AccessDenied'));
    const storage = { deleteObject: jest.fn(), deletePrefix: jest.fn().mockRejectedValue(new Error('s3 down')) };
    const service = new UsersService(
      prisma as any,
      { get: (k: string) => ({ COGNITO_USER_POOL_ID: 'p', AWS_REGION: 'r' })[k] } as any,
      storage as any,
    );
    const { leftovers } = await (service as any).closeAccount(USER);
    expect(leftovers).toEqual(['profile photo', 'WhatsApp media', 'Google/Apple sign-in']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// O17 (App Store 5.1.1(v)): the stored Apple token is revoked; a failure never
// blocks the erasure and lands on the PRIVACY case as "Apple sign-in".
describe('UsersService.closeAccount Apple token revoke', () => {
  function build(revoke: jest.Mock) {
    const prisma: any = makePrisma();
    prisma.userIdentity.findMany = jest.fn(async () => [
      { provider: 'APPLE', providerUserId: 'sub-apple', email: 'a@b.in', emailVerified: true, appleRefreshToken: 'enc-1' },
      // Signed in before O17: nothing stored, nothing to revoke.
      { provider: 'APPLE', providerUserId: 'sub-old', email: null, emailVerified: false, appleRefreshToken: null },
    ]);
    prisma.user.findMany = jest.fn(async () => [{ id: USER }]);
    prisma.supportMessage.findFirst = jest.fn(async () => null);
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    cognitoSend.mockReset();
    cognitoSend.mockResolvedValue({ Users: [] });
    const service = new UsersService(
      prisma,
      { get: () => undefined } as any,
      { deleteObject: jest.fn(), deletePrefix: jest.fn(async () => 0) } as any,
      events as any,
      { revoke } as any,
    );
    (service as any).assertAccountCanClose = jest.fn();
    return { service, prisma, events };
  }

  it('revokes the stored token after the erasure commits', async () => {
    const revoke = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = build(revoke);
    await expect((service as any).closeAccount(USER)).resolves.toEqual({ leftovers: [] });
    expect(revoke.mock.calls).toEqual([['enc-1']]);
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(revoke.mock.invocationCallOrder[0]);
  });

  it('a failed revoke still erases and reopens the case naming Apple sign-in', async () => {
    const revoke = jest.fn().mockRejectedValue(new Error('Apple /auth/revoke 400'));
    const { service, prisma, events } = build(revoke);
    await expect(service.purgeDueDeletions()).resolves.toEqual({ closed: 1, blocked: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const lines = events.emitAsync.mock.calls.map(([, l]) => l).filter((l) => l.text);
    expect(lines.map((l) => l.status)).toEqual(['CLOSED', 'OPEN']);
    expect(lines[1].text).toContain('Apple sign-in');
  });
});

describe('UsersService.closeAccount with no verified email or mobile', () => {
  it('does not look up or match any funnel leads', async () => {
    const prisma = makePrisma();
    prisma.userIdentity.findMany = jest.fn(async () => []);
    prisma.user.findUnique = jest.fn(async () => ({
      id: USER,
      deletedAt: null,
      avatarUrl: null,
      mobileNumber: '+919876543210',
      mobileVerified: false,
    }));
    const service = new UsersService(
      prisma as any,
      { get: () => undefined } as any,
      { deleteObject: jest.fn(), deletePrefix: jest.fn() } as any,
    );
    await (service as any).closeAccount(USER);
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const tx = (prisma.$transaction.mock.calls[0] as any)[0];
    expect(tx.find((w: any) => w.name === 'lead.updateMany').args.where).toEqual({
      id: { in: [] },
    });
  });
});

describe('privateFileKeys', () => {
  it('finds nested private keys and ignores others', () => {
    expect(
      privateFileKeys([
        { a: [{ b: file('private/form-uploads/e/f/u/1.pdf') }] },
        file('public/avatars/x.png'),
        file('private/form-uploads/../etc'),
        null,
        'private/form-uploads/plain-string',
      ]),
    ).toEqual(['private/form-uploads/e/f/u/1.pdf']);
  });
});
