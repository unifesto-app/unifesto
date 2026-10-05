import { Prisma, RefundStatus } from '@prisma/client';
import { UsersService, privateFileKeys } from './users.service';
import { REDACTED_REFUND_REASON } from '../common/account-deletion';

/**
 * closeAccount's DPDP scrub: personal data on the user's registrations, group
 * seats and stay bookings goes, money fields and other people's data stay,
 * and referenced private uploads are deleted after the transaction.
 */

const USER = 'user-1';
const file = (key: string) => ({ key, name: 'x.pdf', size: 1, mime: 'application/pdf' });
const MY_FORM = 'private/form-uploads/ev1/f1/user-1/a.pdf';
const MY_MEMBER_FILE = 'private/form-uploads/ev2/f2/lead-2/m.pdf';
const OTHER_MEMBER_FILE = 'private/form-uploads/ev1/f3/user-1/friend.pdf';
const MY_ID = 'private/form-uploads/ev1/stay-id-s1/user-1/id.jpg';

function makePrisma() {
  // Each write returns a tag so the test can see what went into $transaction.
  const op = (name: string) => jest.fn((args: unknown) => ({ name, args }));
  return {
    user: {
      findUnique: jest.fn(async () => ({
        id: USER,
        deletedAt: null,
        avatarUrl: null,
        mobileNumber: '+919876543210',
        mobileVerified: true,
      })),
      update: op('user.update'),
    },
    eventRegistration: {
      findMany: jest.fn(async () => [
        {
          // The user's own group booking: they're the lead (entry 0).
          id: 'reg-own',
          formResponses: { q1: 'my phone 999', q2: file(MY_FORM) },
          groupMembers: [
            { name: 'Me' },
            { name: 'Friend', customFields: { f3: file(OTHER_MEMBER_FILE) } },
          ],
        },
      ]),
      updateMany: op('eventRegistration.updateMany'),
      update: op('eventRegistration.update'),
    },
    groupSeat: {
      findMany: jest.fn(async () => [
        // Seat 1 of their own group.
        {
          seatIndex: 1,
          memberDetails: { name: 'Me' },
          registration: {
            id: 'reg-own',
            groupMembers: [{ name: 'Me' }, { name: 'Friend' }],
          },
        },
        // Seat 3 in someone else's group.
        {
          seatIndex: 3,
          memberDetails: { name: 'Me', customFields: { f2: file(MY_MEMBER_FILE) } },
          registration: {
            id: 'reg-lead2',
            groupMembers: [{ name: 'Lead' }, { name: 'B' }, { name: 'Me' }],
          },
        },
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
      // The query asks for verified emails only; the mock returns what such a
      // query would (the unverified one is filtered by the where clause).
      findMany: jest.fn(async () => [{ email: 'Me@Example.com' }, { email: 'me_work@work.in' }]),
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
    adminDevice: { deleteMany: op('d') },
    notificationSettings: { deleteMany: op('d') },
    favoriteEvent: { deleteMany: op('d') },
    userRole: { deleteMany: op('d') },
    sponsorUser: { deleteMany: op('d') },
    payoutBankAccount: { deleteMany: op('d') },
    eventCheckinAccess: { deleteMany: op('d') },
    sessionCoHost: { deleteMany: op('d') },
    // Phone-only leads whose last 10 digits match, as the SQL narrows them.
    $queryRaw: jest.fn(async () => [
      { id: 'lead-p1', phone: '+91 98 76 54 32 10' },
      // Typed with a trunk 0: normalizeMobile can't read it, so it's left.
      { id: 'lead-p0', phone: '09876543210' },
      // A US number ending in the same 10 digits: not this user.
      { id: 'lead-px', phone: '+1 212 9876543210' },
    ]),
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
}

describe('UsersService.closeAccount PII scrub', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { deleteObject: jest.Mock };
  let tx: Array<{ name: string; args: any }>;

  beforeEach(async () => {
    prisma = makePrisma();
    storage = { deleteObject: jest.fn(async () => undefined) };
    const service = new UsersService(prisma as any, { get: () => undefined } as any, storage as any);
    await (service as any).closeAccount(USER);
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
      where: { userId: USER, emailVerified: true, email: { not: null } },
      select: { email: true },
    });
    // The SQL narrows phone-only leads on the mobile's last 10 digits.
    expect((prisma.$queryRaw.mock.calls[0] as unknown[]).slice(1)).toEqual(['9876543210']);
    // me_work@work.in's `_` would match meXwork@ under ILIKE; only exact hits go,
    // and of the phone candidates only the real +91 number does.
    expect(writes('lead.updateMany')).toEqual([
      {
        where: { id: { in: ['lead-1', 'lead-p1'] } },
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

  it('blanks only the user’s own roster entries, keeping indices', () => {
    const rosters = Object.fromEntries(
      writes('eventRegistration.update').map((a) => [a.where.id, a.data.groupMembers]),
    );
    expect(rosters).toEqual({
      'reg-own': [{}, { name: 'Friend', customFields: { f3: file(OTHER_MEMBER_FILE) } }],
      'reg-lead2': [{ name: 'Lead' }, { name: 'B' }, {}],
    });
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
      data: { name: 'Deleted guest', phone: null, email: null, idProof: Prisma.DbNull },
    });
  });

  it('deletes the user’s private files but not a fellow member’s', () => {
    const deleted = storage.deleteObject.mock.calls.map((c) => c[0]).sort();
    expect(deleted).toEqual([MY_FORM, MY_MEMBER_FILE, MY_ID].sort());
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
      { deleteObject: jest.fn() } as any,
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
