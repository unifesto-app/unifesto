import { GroupSeatStatus, PaymentStatus, RegistrationStatus } from '@prisma/client';
import { RegistrationTransfersService } from './registration-transfers.service';
import { TeamChangesService } from './team-changes.service';
import { GroupSeatsService } from './group-seats.service';
import { rateCardTerms } from '../subscription/terms.testing';

/** A28 follow-up: the QR ceilings. A pass someone no longer holds stops scanning. */

const flush = () => new Promise((r) => setImmediate(r));

describe('A28 admin transfer rotates the QR', () => {
  const claimedAt = new Date('2026-09-25T10:00:00Z');
  const build = () => {
    const db: any = {
      userIdentity: {
        findFirst: jest.fn(async ({ where }: any) => (where.userId === 'old' ? { email: 'old@x.com' } : { userId: 'new' })),
      },
      eventRegistration: {
        findFirst: jest.fn(async ({ where }: any) => (where.id ? { id: 'r-1', eventId: 'e-1', userId: 'old', ticketTypeId: 't-1' } : null)),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'r-1', eventId: 'e-1', qrCode: 'NEW', user: { id: 'new', identities: [{ email: 'new@x.com' }] } })),
      },
      groupSeat: {
        count: jest.fn(async () => 0),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findMany: jest.fn(async () => [{ claimedAt }]),
      },
      eventTicket: {
        // The booking's own ticket, and an old unstamped claim's seat ticket.
        findMany: jest.fn(async () => [
          { id: 'own-t', createdAt: new Date('2026-09-01T10:00:00Z') },
          { id: 'claim-t', createdAt: new Date(+claimedAt + 2_000) },
        ]),
        update: jest.fn(async () => ({})),
      },
      groupLeadTransfer: { updateMany: jest.fn(async () => ({ count: 1 })) },
      event: { findUnique: jest.fn(async () => ({ title: 'Hack' })) },
    };
    db.$transaction = jest.fn(async (fn: any) => fn(db));
    const seats = { resendConfirmation: jest.fn(async () => undefined) };
    const svc = new RegistrationTransfersService(db, {} as any, { sendRawEmail: jest.fn(async () => undefined) } as any, seats as any);
    return { svc, db, seats };
  };

  it('gives the booking and its own tickets new codes, leaves members’ tickets, and mails the new holder their pass', async () => {
    const { svc, db, seats } = build();
    await svc.adminTransferRegistration('e-1', 'r-1', 'new@x.com');
    expect(db.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', userId: 'old' },
      data: { userId: 'new', qrCode: expect.stringMatching(/^[0-9a-f]{32}$/) },
    });
    expect(db.eventTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { registrationId: 'r-1', attendeeEmail: null } }));
    expect(db.eventTicket.update.mock.calls.map((c: any[]) => c[0].where.id)).toEqual(['own-t']);
    expect(db.eventTicket.update.mock.calls[0][0].data).toEqual({ qrCode: expect.any(String), ticketCode: expect.any(String) });
    await flush();
    expect(seats.resendConfirmation).toHaveBeenCalledWith('r-1', 'new');
  });
});

describe('A28 a teammate on the shared QR leaving rotates it', () => {
  const later = new Date(Date.now() + 86_400_000);
  const reg = {
    id: 'r-1',
    userId: 'lead',
    eventId: 'e-1',
    status: RegistrationStatus.REGISTERED,
    paymentStatus: PaymentStatus.PAID,
    isWaitlisted: false,
    groupSize: 4,
    checkedInAt: null,
    ticketTypeId: 't-1',
    ticketType: { id: 't-1', kind: 'GROUP', price: 0, groupPricingMode: 'PER_GROUP', minGroupSize: 2, maxGroupSize: 6, totalQuantity: 10, soldCount: 4 },
    event: { id: 'e-1', title: 'Hack', slug: 'hack', status: 'PUBLISHED', endDateTime: later, allowTeamChanges: true, teamChangesUntil: null },
  };
  // Seat 2 leaves. Seat 3 is a typed-in teammate still on the group QR; seat 4
  // was mailed their own ticket after A28.
  const leaving = { id: 's-2', seatIndex: 2, status: GroupSeatStatus.CLAIMED, claimedByUserId: null, inviteEmail: null, memberDetails: { name: 'Old', email: 'old@x.com' } };
  const build = (ownTickets: number) => {
    const created: any[] = [];
    const db: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => reg),
        findUniqueOrThrow: jest.fn(async () => ({ groupSize: 4, status: RegistrationStatus.REGISTERED, paymentStatus: PaymentStatus.PAID, isWaitlisted: false })),
        update: jest.fn(async () => ({})),
      },
      groupSeat: {
        findUnique: jest.fn(async () => leaving),
        count: jest.fn(async () => 4),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findMany: jest.fn(async ({ where }: any) =>
          where.claimedByUserId === null
            ? [{ memberDetails: { name: 'Typed', email: 'Typed@x.com' } }, { memberDetails: { name: 'New', email: 'new@x.com' } }]
            : [],
        ),
        update: jest.fn(),
      },
      eventTicket: {
        deleteMany: jest.fn(async () => ({ count: ownTickets })),
        findMany: jest.fn(async () => [{ attendeeEmail: 'new@x.com' }]),
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { qrCode: data.qrCode, ticketCode: data.ticketCode };
        }),
      },
      eventGroupMemberCheckin: { count: jest.fn(async () => 0) },
      certificate: { count: jest.fn(async () => 0) },
      eventTicketType: { update: jest.fn() },
      event: { update: jest.fn() },
      groupLeadTransfer: { updateMany: jest.fn(async () => ({ count: 0 })) },
      $queryRaw: jest.fn(async () => []),
      $executeRaw: jest.fn(async () => 0),
    };
    db.$transaction = jest.fn(async (fn: any) => fn(db));
    const email = { sendRawEmail: jest.fn(async () => undefined) };
    const seats = new GroupSeatsService(db, email as any, {} as any);
    const sendRotated = jest.spyOn(seats, 'sendRotatedPasses').mockResolvedValue(undefined);
    return { db, seats, email, created, sendRotated };
  };
  const rotatedTo = (db: any) => db.eventRegistration.update.mock.calls.find((c: any[]) => c[0].data.qrCode)?.[0].data.qrCode;

  it('remove: a teammate with no ticket of their own held the group QR, so it rotates and the rest get passes', async () => {
    const { db, seats, created, sendRotated } = build(0);
    const team = new TeamChangesService(db, seats, {} as any, { sendRawEmail: jest.fn(async () => undefined) } as any, {} as any, rateCardTerms());
    await team.removeSeat('r-1', 2, { by: 'curator', eventId: 'e-1' });
    expect(rotatedTo(db)).toMatch(/^[0-9a-f]{32}$/);
    // Only the typed-in teammate still on the group QR gets a seat ticket.
    expect(created).toEqual([expect.objectContaining({ registrationId: 'r-1', attendeeEmail: 'typed@x.com', attendeeName: 'Typed' })]);
    expect(sendRotated).toHaveBeenCalledWith('r-1', [expect.objectContaining({ email: 'typed@x.com' })]);
  });

  it('remove: a teammate who had their own ticket never saw the group QR, so it stays', async () => {
    const { db, seats, created, sendRotated } = build(1);
    const team = new TeamChangesService(db, seats, {} as any, { sendRawEmail: jest.fn(async () => undefined) } as any, {} as any, rateCardTerms());
    await team.removeSeat('r-1', 2, { by: 'curator', eventId: 'e-1' });
    expect(rotatedTo(db)).toBeUndefined();
    expect(created).toEqual([]);
    expect(sendRotated).not.toHaveBeenCalled();
  });

  it('replace: same rule', async () => {
    const { db, seats, sendRotated } = build(0);
    await seats.replaceMember('r-1', 2, { by: 'curator', eventId: 'e-1' });
    expect(rotatedTo(db)).toMatch(/^[0-9a-f]{32}$/);
    expect(sendRotated).toHaveBeenCalled();
  });

  it('the lead and each newly ticketed teammate are mailed their new pass', async () => {
    const db: any = { eventRegistration: { findUnique: jest.fn(async () => ({ userId: 'lead' })) } };
    const seats = new GroupSeatsService(db, {} as any, {} as any);
    const resend = jest.spyOn(seats, 'resendConfirmation').mockResolvedValue({ email: 'lead@x.com', whatsapp: false });
    const send = jest.spyOn(seats as any, 'sendClaimConfirmations').mockResolvedValue({ email: null, whatsapp: false });
    const ticket = { qrCode: 'Q', ticketCode: 'T' };
    await seats.sendRotatedPasses('r-1', [{ email: 'typed@x.com', details: { name: 'Typed' }, ticket }]);
    expect(resend).toHaveBeenCalledWith('r-1', 'lead');
    expect(send).toHaveBeenCalledWith('r-1', null, 'typed@x.com', { name: 'Typed' }, ticket);
  });
});
