import { BadRequestException, ConflictException } from '@nestjs/common';
import { GroupLeadTransferStatus, GroupSeatStatus, PaymentStatus, RegistrationStatus } from '@prisma/client';
import { TeamChangesService } from './team-changes.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { MyRegistrationsService } from './my-registrations.service';
import { GroupSeatsService } from './group-seats.service';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { WaitlistService } from './waitlist.service';
import { SoldOutError } from './capacity.util';
import { seatTicketOf } from './registration.util';

/** A28: group seat edits, transfers and member data. One block per finding. */

const later = new Date(Date.now() + 86_400_000);

describe('A28 team changes need a booked group', () => {
  const group = (over: object) => ({
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
    event: { id: 'e-1', title: 'Hack', slug: 'hack', status: 'PUBLISHED', endDateTime: later, absorbProcessingFee: false, allowTeamChanges: true, teamChangesUntil: null },
    ...over,
  });
  const build = (reg: object) => {
    const prisma: any = {
      eventRegistration: { findUnique: jest.fn(async () => reg) },
      groupSeat: { findUnique: jest.fn() },
      groupSeatPurchase: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const seats = { assertLeadMayChangeTeam: jest.fn(), ensureSeatsForRegistration: jest.fn() };
    const svc = new TeamChangesService(prisma, seats as any, { priceSale: (b: number) => ({ base: b, fee: 0, total: b }) } as any, {} as any, {} as any);
    return { svc, prisma };
  };
  const lead = { by: 'lead' as const, userId: 'lead' };

  it.each([
    ['an unpaid (PENDING) group', { paymentStatus: PaymentStatus.PENDING }],
    ['a WAITING group', { paymentStatus: PaymentStatus.PENDING, isWaitlisted: true }],
    ['an OFFERED group', { isWaitlisted: true }],
    ['a refunded group', { paymentStatus: PaymentStatus.REFUNDED }],
  ])('%s: no remove, add, add-order or handover, and capacity never moves', async (_, over) => {
    const { svc, prisma } = build(group(over));
    await expect(svc.removeSeat('r-1', 2, lead)).rejects.toThrow(/isn’t booked/);
    await expect(svc.addSeats('r-1', 1, lead)).rejects.toThrow(/isn’t booked/);
    await expect(svc.createAddSeatsOrder('r-1', 'lead', 1)).rejects.toThrow(/isn’t booked/);
    await expect(svc.requestLeadTransfer('r-1', 'lead', 2)).rejects.toThrow(/isn’t booked/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.groupSeatPurchase.create).not.toHaveBeenCalled();
  });

  it('a paid seat purchase on a group refunded meanwhile is refunded, not added', async () => {
    const { svc } = build(group({}));
    const tx: any = {
      $queryRaw: jest.fn(),
      eventRegistration: {
        findUniqueOrThrow: jest.fn(async () => ({ groupSize: 4, status: RegistrationStatus.REGISTERED, paymentStatus: PaymentStatus.REFUNDED, isWaitlisted: false })),
      },
      groupSeat: { createMany: jest.fn() },
    };
    await expect((svc as any).growInTx(tx, group({}), 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.groupSeat.createMany).not.toHaveBeenCalled();
  });
});

describe('A28 admin transfer of a group moves seat 1', () => {
  const build = (memberSeats = 0) => {
    const db: any = {
      userIdentity: {
        findFirst: jest.fn(async ({ where }: any) => (where.userId === 'old' ? { email: 'old@x.com' } : { userId: 'new' })),
      },
      eventRegistration: {
        findFirst: jest.fn(async ({ where }: any) => (where.id ? { id: 'r-1', eventId: 'e-1', userId: 'old', ticketTypeId: 't-1' } : null)),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'r-1', eventId: 'e-1', user: { id: 'new', identities: [{ email: 'new@x.com' }] } })),
      },
      groupSeat: { count: jest.fn(async () => memberSeats), updateMany: jest.fn(async () => ({ count: 1 })) },
      groupLeadTransfer: { updateMany: jest.fn(async () => ({ count: 1 })) },
      event: { findUnique: jest.fn(async () => ({ title: 'Hack' })) },
    };
    db.$transaction = jest.fn(async (fn: any) => fn(db));
    const email = { sendRawEmail: jest.fn(async () => undefined) };
    const svc = new RegistrationTransfersService(db, {} as any, email as any);
    return { svc, db, email };
  };

  it('hands seat 1 to the new holder, withdraws a pending lead handover and tells both', async () => {
    const { svc, db, email } = build();
    await svc.adminTransferRegistration('e-1', 'r-1', 'new@x.com');
    expect(db.groupSeat.updateMany).toHaveBeenCalledWith({
      where: { registrationId: 'r-1', seatIndex: 1 },
      data: expect.objectContaining({ claimedByUserId: 'new' }),
    });
    expect(db.groupLeadTransfer.updateMany).toHaveBeenCalledWith({
      where: { registrationId: 'r-1', status: GroupLeadTransferStatus.PENDING },
      data: expect.objectContaining({ status: GroupLeadTransferStatus.CANCELLED }),
    });
    await new Promise((r) => setImmediate(r));
    expect(email.sendRawEmail.mock.calls.map((c: any[]) => c[0])).toEqual(['old@x.com', 'new@x.com']);
  });

  it('refuses an account that already holds a member seat in the group', async () => {
    const { svc, db } = build(1);
    await expect(svc.adminTransferRegistration('e-1', 'r-1', 'new@x.com')).rejects.toBeInstanceOf(ConflictException);
    expect(db.eventRegistration.updateMany).not.toHaveBeenCalled();
  });
});

describe('A28 a member sees only their own seat', () => {
  const claimedAt = new Date('2026-10-01T10:00:00Z');
  const tickets = [
    { id: 'lead-t', qrCode: 'LEAD-QR', attendeeEmail: null, createdAt: new Date('2026-09-01T10:00:00Z') },
    { id: 'mate-t', qrCode: 'MATE-QR', attendeeEmail: 'mate@x.com', createdAt: new Date('2026-09-20T10:00:00Z') },
    { id: 'me-t', qrCode: 'MY-QR', attendeeEmail: 'me@x.com', createdAt: claimedAt },
  ];
  const reg = {
    id: 'r-1',
    eventId: 'e-1',
    userId: 'lead',
    ticketTypeId: 't-1',
    status: RegistrationStatus.REGISTERED,
    paymentStatus: PaymentStatus.PAID,
    groupSize: 3,
    registeredAt: new Date(),
    checkedInAt: null,
    qrCode: 'LEAD-QR',
    formAnswers: { college: 'secret' },
    paymentId: 'pay_secret',
    orderId: 'order_secret',
    event: { id: 'e-1', title: 'Hack' },
    ticketType: { id: 't-1', name: 'Team' },
    tickets,
    user: { fullName: 'Lead', username: null },
  };

  it('member tickets carry no form answers, payment ids or teammate QRs', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn(async () => ({ identities: [{ email: 'me@x.com' }] })) },
      $queryRaw: jest.fn(async () => []),
      groupSeat: { findMany: jest.fn(async () => [{ registrationId: 'r-1', claimedAt }]) },
      eventRegistration: { findMany: jest.fn(async () => [reg]) },
    };
    const svc = new MyRegistrationsService(prisma, {} as any, {} as any);
    const { data } = await svc.getMyMemberTickets('me');
    expect(data[0]).toMatchObject({ id: 'r-1', isGroupMember: true, qrCode: 'MY-QR', leadName: 'Lead' });
    expect(data[0].tickets.map((t: any) => t.id)).toEqual(['me-t']);
    const json = JSON.stringify(data);
    for (const leak of ['secret', 'pay_secret', 'order_secret', 'MATE-QR', 'LEAD-QR']) expect(json).not.toContain(leak);
  });

  it('a seat ticket is never a teammate’s or the group’s own', () => {
    const mine = new Set(['me@x.com']);
    expect(seatTicketOf(tickets, mine, claimedAt)?.id).toBe('me-t');
    // An old unstamped claim: only an unstamped ticket made at the claim counts.
    expect(seatTicketOf(tickets, new Set(['other@x.com']), new Date('2026-09-20T10:00:10Z'))).toBeUndefined();
    const unstamped = { id: 'old-t', qrCode: 'OLD', attendeeEmail: null, createdAt: new Date('2026-09-25T10:00:01Z') };
    expect(seatTicketOf([...tickets, unstamped], new Set(), new Date('2026-09-25T10:00:00Z'))?.id).toBe('old-t');
  });

  it('resend never mails a teammate’s QR', async () => {
    const prisma: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => ({ userId: 'lead', qrCode: 'LEAD-QR', status: RegistrationStatus.REGISTERED, paymentStatus: PaymentStatus.PAID, tickets })),
      },
      userIdentity: { findMany: jest.fn(async () => [{ email: 'someone@x.com', isPrimary: true }]) },
      groupSeat: { findFirst: jest.fn(async () => ({ claimedAt: new Date('2026-09-20T10:00:05Z'), memberDetails: null })) },
    };
    const svc = new GroupSeatsService(prisma, {} as any, {} as any);
    await expect(svc.resendConfirmation('r-1', 'someone')).rejects.toThrow(/couldn't find your ticket/);
  });
});

describe('A28 a lead can only mail from a booked group', () => {
  const unpaid = { id: 'r-1', userId: 'lead', status: RegistrationStatus.REGISTERED, paymentStatus: PaymentStatus.PENDING, isWaitlisted: false, event: { id: 'e-1', title: 'Hack', slug: 'hack' } };

  it('no invites on an unpaid group', async () => {
    const prisma: any = { eventRegistration: { findUnique: jest.fn(async () => unpaid) }, groupSeat: { findMany: jest.fn() } };
    const email = { sendRawEmail: jest.fn() };
    const svc = new GroupSeatsService(prisma, email as any, {} as any);
    await expect(svc.invite('r-1', 'lead', [{ email: 'x@x.com' }])).rejects.toThrow(/isn’t booked/);
    expect(email.sendRawEmail).not.toHaveBeenCalled();
  });

  it('no roster edit (and so no ticket email or WhatsApp) on an unpaid or cancelled group', async () => {
    for (const over of [{ paymentStatus: PaymentStatus.PENDING }, { status: RegistrationStatus.CANCELLED, paymentStatus: PaymentStatus.PAID }]) {
      const prisma: any = {
        eventRegistration: { findUnique: jest.fn(async () => ({ ...unpaid, ...over, groupSize: 3, isWaitlisted: false, event: {}, tickets: [] })) },
      };
      const confirmations = { sendGroupMemberConfirmations: jest.fn() };
      const svc = new MyRegistrationsService(prisma, {} as any, confirmations as any);
      await expect(svc.updateMyGroupMembers('lead', 'r-1', [{ name: 'X', email: 'x@x.com', mobile: '9000000000' } as any])).rejects.toThrow(/isn’t booked/);
      expect(confirmations.sendGroupMemberConfirmations).not.toHaveBeenCalled();
    }
  });
});

describe('A28 typed-in teammates get their own revocable ticket', () => {
  it('each member is mailed a seat ticket stamped with their email, not the group QR', async () => {
    const created: any[] = [];
    const prisma: any = {
      eventTicket: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { qrCode: data.qrCode, ticketCode: data.ticketCode };
        }),
      },
    };
    const email = { sendRegistrationConfirmation: jest.fn(async () => undefined) };
    const whatsapp = { sendRegistrationConfirmation: jest.fn(async () => undefined) };
    const svc = new RegistrationConfirmationsService(prisma, email as any, whatsapp as any, {} as any, {} as any, {} as any);
    const event = { id: 'e-1', title: 'Hack', startDateTime: later, endDateTime: later };
    await svc.sendGroupMemberConfirmations('r-1', event, 'GROUP-QR', 'GRP', null, [{ name: 'Bimal', email: 'Bimal@x.com', mobile: '9000000001' }]);
    expect(created).toEqual([expect.objectContaining({ registrationId: 'r-1', attendeeEmail: 'bimal@x.com', attendeeName: 'Bimal' })]);
    const sent = (email.sendRegistrationConfirmation.mock.calls as any[])[0][0];
    expect(sent.qrCode).toBe(created[0].qrCode);
    expect(sent.qrCode).not.toBe('GROUP-QR');
  });
});

describe('A28 claims', () => {
  const seatRow = (over: object = {}) => ({
    id: 's-2',
    registrationId: 'r-1',
    seatIndex: 2,
    status: GroupSeatStatus.INVITED,
    inviteEmail: 'me@x.com',
    inviteToken: 'tok',
    claimedByUserId: null,
    memberDetails: null,
    registration: {
      id: 'r-1',
      eventId: 'e-1',
      ticketTypeId: null,
      status: RegistrationStatus.REGISTERED,
      paymentStatus: PaymentStatus.PAID,
      event: { id: 'e-1', title: 'Hack', slug: 'hack', status: 'PUBLISHED', endDateTime: later, deletedAt: null },
    },
    ...over,
  });

  it('an unverified identity email cannot claim', async () => {
    const prisma: any = {
      groupSeat: { findUnique: jest.fn(async () => seatRow()) },
      userIdentity: { findFirst: jest.fn(async ({ where }: any) => (where.emailVerified === true ? null : { userId: 'me' })) },
    };
    const svc = new GroupSeatsService(prisma, {} as any, {} as any);
    await expect(svc.claim('tok', 'me')).rejects.toThrow(/different account/);
  });

  it('the invite list reads verified emails only', async () => {
    const prisma: any = { userIdentity: { findMany: jest.fn(async () => []) } };
    const svc = new GroupSeatsService(prisma, {} as any, {} as any);
    await svc.listMyInvites('me');
    expect(prisma.userIdentity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ emailVerified: true }) }));
  });

  it('the seat and its ticket are written in one transaction', async () => {
    let inTx = false;
    const writes: string[] = [];
    const prisma: any = {
      groupSeat: {
        findUnique: jest.fn(async () => seatRow()),
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async () => {
          writes.push(`seat:${inTx}`);
          return { count: 1 };
        }),
      },
      eventRegistration: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
      userIdentity: { findFirst: jest.fn(async () => ({ userId: 'me' })), findMany: jest.fn(async () => [{ email: 'me@x.com', isPrimary: true }]) },
      eventFormField: { findMany: jest.fn(async () => []) },
      eventTicket: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: any) => {
          writes.push(`ticket:${inTx}`);
          return data;
        }),
      },
      user: { findUnique: jest.fn(async () => null) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => {
      inTx = true;
      try {
        return await fn(prisma);
      } finally {
        inTx = false;
      }
    });
    const svc = new GroupSeatsService(prisma, { sendRegistrationConfirmation: jest.fn() } as any, {} as any);
    await svc.claim('tok', 'me', { name: 'Me' });
    expect(writes).toEqual(['seat:true', 'ticket:true']);
  });
});

describe('A28 waitlist "Allow next N" skips a group that does not fit', () => {
  it('walks past it and still lets the next people in', async () => {
    const queue = [
      { id: 'big', groupSize: 4, quantity: 1 },
      { id: 'solo-1', groupSize: null, quantity: 1 },
      { id: 'big-2', groupSize: 5, quantity: 1 },
      { id: 'solo-2', groupSize: null, quantity: 1 },
      { id: 'solo-3', groupSize: null, quantity: 1 },
    ];
    const prisma: any = { eventRegistration: { findMany: jest.fn(async () => queue) } };
    const svc = new WaitlistService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'assertOrganiser').mockResolvedValue({});
    const offer = jest.spyOn(svc, 'offer').mockImplementation(async (_o, _e, id) => {
      if (id.startsWith('big')) throw new SoldOutError('Not enough seats free');
      return {} as any;
    });
    const res = await svc.offerNext('org', 'e-1', 't-1', 2);
    expect(res.offered).toEqual(['solo-1', 'solo-2']);
    // big-2 needs more than big, which already didn't fit: never tried.
    expect(offer.mock.calls.map((c) => c[2])).toEqual(['big', 'solo-1', 'solo-2']);
    expect(res.skipped.map((s) => s.registrationId)).toEqual(['big', 'big-2']);
  });
});
