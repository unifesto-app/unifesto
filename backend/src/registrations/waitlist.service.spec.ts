import {
  GroupSeatStatus,
  PaymentStatus,
  Prisma,
  RegistrationStatus,
  WaitlistStatus,
} from '@prisma/client';
import { GroupSeatsService } from './group-seats.service';
import { WaitlistService } from './waitlist.service';

/**
 * Pins the seat-holding invariant across a waiting-list conversion:
 *
 *   offer() a spot → the seat is held, then, once paid (or free), convert()
 *   turns it into a real attendee — issuing the EventTicket rows AND seeding
 *   the GroupSeat roster.
 *
 * Two regressions this guards against, both from convert() leaning on its
 * caller instead of doing the work itself:
 *   1. A FREE offer auto-converts but the caller passed no ticket generators,
 *      so the attendee ended up CONVERTED with no ticket to scan.
 *   2. convert() never seeded GroupSeat rows, so a group let in off the
 *      waitlist had no roster — broken group check-in on both free and paid.
 *
 * A small in-memory Prisma backs real WaitlistService + GroupSeatsService
 * instances, so tickets and seats are asserted as state that actually crossed
 * the transaction, not per-call stubs. Only the query shapes these paths use
 * are implemented.
 */

const ORGANISER = 'user-organiser';
const ATTENDEE = 'user-attendee';
const EVENT_ID = 'event-1';
const SPACE_ID = 'space-1';
const TT_ID = 'tt-1';

/** Apply a Prisma-style `data` (supports `{increment}`/`{decrement}`) onto a row. */
function applyData(target: any, data: Record<string, any>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Prisma.Decimal)) {
      if ('increment' in v) {
        target[k] = (target[k] ?? 0) + v.increment;
        continue;
      }
      if ('decrement' in v) {
        target[k] = (target[k] ?? 0) - v.decrement;
        continue;
      }
    }
    target[k] = v;
  }
}

type RegSeed = {
  quantity?: number;
  groupSize?: number | null;
  waitlistStatus?: WaitlistStatus;
  paymentStatus?: PaymentStatus;
  status?: string;
};

function makeDb(opts: {
  ticketType: {
    price: number;
    kind?: 'INDIVIDUAL' | 'GROUP';
    groupPricingMode?: 'PER_PERSON' | 'FLAT' | null;
    totalQuantity: number | null;
    soldCount: number;
  };
  reg: RegSeed;
}) {
  const event: any = {
    id: EVENT_ID,
    spaceId: SPACE_ID,
    title: 'Hack Night',
    slug: 'hack-night',
    startDateTime: new Date('2026-10-01T10:00:00Z'),
    endDateTime: new Date('2026-10-01T12:00:00Z'),
    timezone: 'Asia/Kolkata',
    type: 'OFFLINE',
    waitlistCount: 1,
    registeredCount: 0,
  };

  const ticketType: any = {
    id: TT_ID,
    name: 'General',
    price: opts.ticketType.price,
    currency: 'INR',
    kind: opts.ticketType.kind ?? 'INDIVIDUAL',
    groupPricingMode: opts.ticketType.groupPricingMode ?? null,
    totalQuantity: opts.ticketType.totalQuantity,
    soldCount: opts.ticketType.soldCount,
  };

  const reg: any = {
    id: 'reg-1',
    eventId: EVENT_ID,
    userId: ATTENDEE,
    ticketTypeId: TT_ID,
    quantity: opts.reg.quantity ?? 1,
    groupSize: opts.reg.groupSize ?? null,
    isWaitlisted: true,
    waitlistStatus: opts.reg.waitlistStatus ?? WaitlistStatus.WAITING,
    paymentStatus: opts.reg.paymentStatus ?? PaymentStatus.PENDING,
    status: opts.reg.status ?? 'REGISTERED',
    waitlistedAt: new Date('2026-09-01T00:00:00Z'),
    waitlistOfferedAt: null,
    waitlistOfferExpiresAt: null,
    totalAmount: new Prisma.Decimal(0),
    processingFee: new Prisma.Decimal(0),
    razorpayAmount: new Prisma.Decimal(0),
  };

  const tickets: any[] = [];
  const groupSeats: any[] = [];
  let seatSeq = 0;
  let ticketSeq = 0;

  const prisma: any = {
    event: {
      findUnique: async () => ({ ...event }),
      update: async ({ data }: any) => {
        applyData(event, data);
        return { ...event };
      },
    },
    userRole: {
      // Non-zero ⇒ the caller passes the organiser check.
      count: async () => 1,
    },
    eventTicketType: {
      findUnique: async () => ({ ...ticketType }),
      update: async ({ data }: any) => {
        applyData(ticketType, data);
        return { ...ticketType };
      },
    },
    eventRegistration: {
      findUnique: async ({ include }: any) => {
        const out: any = { ...reg };
        if (include?.ticketType) out.ticketType = { ...ticketType };
        return out;
      },
      findUniqueOrThrow: async () => ({ ...reg }),
      findFirst: async () => null,
      count: async () => 0,
      create: async ({ data }: any) => {
        Object.assign(reg, data);
        return { ...reg };
      },
      update: async ({ data }: any) => {
        applyData(reg, data);
        return { ...reg };
      },
      updateMany: async ({ where, data }: any) => {
        if (where.waitlistStatus && reg.waitlistStatus !== where.waitlistStatus) return { count: 0 };
        if (where.status?.not && reg.status === where.status.not) return { count: 0 };
        applyData(reg, data);
        return { count: 1 };
      },
    },
    eventTicket: {
      count: async ({ where }: any) =>
        tickets.filter((t) => t.registrationId === where.registrationId).length,
      create: async ({ data }: any) => {
        const row = { id: `ticket-${++ticketSeq}`, ...data };
        tickets.push(row);
        return row;
      },
    },
    groupSeat: {
      count: async ({ where }: any) =>
        groupSeats.filter((s) => s.registrationId === where.registrationId).length,
      createMany: async ({ data }: any) => {
        for (const row of data) groupSeats.push({ id: `seat-${++seatSeq}`, ...row });
        return { count: data.length };
      },
    },
    // recipient() short-circuits on a null identity, so no email is sent.
    userIdentity: { findFirst: async () => null },
    user: { findUnique: async () => null },
    // takeTicketSeats' conditional UPDATE: (sql, n, ticketTypeId, n).
    $executeRaw: async (_sql: TemplateStringsArray, n: number) => {
      if (ticketType.totalQuantity != null && ticketType.soldCount + n > ticketType.totalQuantity) return 0;
      ticketType.soldCount += n;
      return 1;
    },
    $transaction: async (fn: any) => fn(prisma),
  };

  return { prisma, event, ticketType, reg, tickets, groupSeats };
}

function build(db: ReturnType<typeof makeDb>) {
  const email: any = {
    sendWaitlistConfirmation: jest.fn().mockResolvedValue(undefined),
    sendWaitlistPromoted: jest.fn().mockResolvedValue(undefined),
    sendWaitlistRevoked: jest.fn().mockResolvedValue(undefined),
  };
  const payments: any = { computeProcessingFee: () => 0, priceSale: (b: number) => ({ base: b, fee: 0, total: b }) };
  const notify: any = { notify: jest.fn().mockResolvedValue({}) };
  const whatsapp: any = {
    sendEventWhatsAppGroupInvite: jest.fn().mockResolvedValue(true),
  };
  const groupSeats = new GroupSeatsService(db.prisma, email, whatsapp);
  const confirmations: any = { sendRegistrationConfirmations: jest.fn().mockResolvedValue(undefined) };
  const svc = new WaitlistService(db.prisma, email, payments, notify, groupSeats, { can: jest.fn().mockResolvedValue(true) } as any, confirmations);
  return { svc, email, notify, groupSeats, confirmations };
}

/** Seats as join() leaves them (S42): created with the waitlist row. */
async function seedJoinSeats(db: ReturnType<typeof makeDb>, members: unknown[]) {
  await build(db).groupSeats.createSeatsForRegistration(db.prisma, {
    registrationId: 'reg-1',
    leadUserId: ATTENDEE,
    seatCount: db.reg.groupSize,
    groupMembers: members,
  });
}

describe('WaitlistService — offer converts to a complete registration', () => {
  it('free solo offer: auto-converts, issues one ticket, seeds no group seats', async () => {
    const db = makeDb({
      ticketType: { price: 0, totalQuantity: 5, soldCount: 4 }, // 1 seat freed up
      reg: { quantity: 1 },
    });
    const { svc, email, confirmations, notify } = build(db);

    const res = await svc.offer(ORGANISER, EVENT_ID, 'reg-1');

    expect(res.waitlistStatus).toBe(WaitlistStatus.CONVERTED);
    expect(res.needsPayment).toBe(false);
    // C9: the usual confirmation with their QR, not an offer email.
    expect(confirmations.sendRegistrationConfirmations).toHaveBeenCalledWith('reg-1');
    expect(email.sendWaitlistPromoted).not.toHaveBeenCalled();
    expect(notify.notify).not.toHaveBeenCalled();

    // The regression: a converted attendee with no ticket. Exactly one is issued.
    expect(db.tickets).toHaveLength(1);
    expect(db.tickets[0]).toMatchObject({
      registrationId: 'reg-1',
      ticketCode: expect.any(String),
      qrCode: expect.any(String),
    });

    // Solo booking ⇒ no group roster.
    expect(db.groupSeats).toHaveLength(0);

    // Now a real attendee: seat held at offer (+1 sold), one attendee counted.
    expect(db.reg.waitlistStatus).toBe(WaitlistStatus.CONVERTED);
    expect(db.reg.isWaitlisted).toBe(false);
    expect(db.reg.status).toBe(RegistrationStatus.REGISTERED);
    expect(db.ticketType.soldCount).toBe(5);
    expect(db.event.registeredCount).toBe(1);
    expect(db.event.waitlistCount).toBe(0);
  });

  it('paid offer: holds the seat and sends the offer through notify() (C2)', async () => {
    const db = makeDb({
      ticketType: { price: 500, totalQuantity: 5, soldCount: 4 },
      reg: { quantity: 1 },
    });
    db.prisma.user.findUnique = async () => ({ fullName: 'Asha', username: null });
    const { svc, email, confirmations, notify } = build(db);

    const res = await svc.offer(ORGANISER, EVENT_ID, 'reg-1');
    await new Promise((r) => setImmediate(r));

    expect(res).toMatchObject({ waitlistStatus: WaitlistStatus.OFFERED, needsPayment: true, amountDue: 500 });
    expect(confirmations.sendRegistrationConfirmations).not.toHaveBeenCalled();
    expect(notify.notify).toHaveBeenCalledWith(
      ATTENDEE,
      'waitlist.offer',
      expect.objectContaining({ entryId: 'reg-1', eventId: EVENT_ID, userName: 'Asha', amountDue: 500, expiresInHours: null }),
    );
    // One path only: no direct email, no event-bus push.
    expect(email.sendWaitlistPromoted).not.toHaveBeenCalled();
  });

  it('free group offer: auto-converts, one shared ticket, seeds a seat per member', async () => {
    const db = makeDb({
      ticketType: {
        price: 0,
        kind: 'GROUP',
        groupPricingMode: 'PER_PERSON',
        totalQuantity: 10,
        soldCount: 6, // 4 seats freed up
      },
      reg: { quantity: 1, groupSize: 4 },
    });
    await seedJoinSeats(db, [{ name: 'Lead' }, { name: 'Bimal' }]);
    const { svc } = build(db);

    const res = await svc.offer(ORGANISER, EVENT_ID, 'reg-1');

    expect(res.waitlistStatus).toBe(WaitlistStatus.CONVERTED);

    // One booking = one shared ticket (keyed on quantity), N seats (keyed on group size).
    expect(db.tickets).toHaveLength(1);
    expect(db.groupSeats).toHaveLength(4);
    expect(db.groupSeats.map((s) => s.seatIndex)).toEqual([1, 2, 3, 4]);
    // Lead + provided member are CLAIMED; the two unfilled seats stay OPEN to invite later.
    expect(db.groupSeats[0].status).toBe(GroupSeatStatus.CLAIMED);
    expect(db.groupSeats[1].status).toBe(GroupSeatStatus.CLAIMED);
    expect(db.groupSeats[2].status).toBe(GroupSeatStatus.OPEN);
    expect(db.groupSeats[3].status).toBe(GroupSeatStatus.OPEN);

    // Group of 4 holds 4 seats and counts as 4 attendees.
    expect(db.ticketType.soldCount).toBe(10);
    expect(db.event.registeredCount).toBe(4);
  });

  it('paid group conversion: convert() seeds the roster even off the paid path', async () => {
    // The offer was already made (seat held); the attendee has just paid.
    const db = makeDb({
      ticketType: {
        price: 500,
        kind: 'GROUP',
        groupPricingMode: 'PER_PERSON',
        totalQuantity: 10,
        soldCount: 10, // seats already held by the OFFERED row
      },
      reg: {
        quantity: 1,
        groupSize: 3,
        waitlistStatus: WaitlistStatus.OFFERED,
      },
    });
    const { svc } = build(db);

    await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });

    expect(db.reg.waitlistStatus).toBe(WaitlistStatus.CONVERTED);
    expect(db.reg.paymentStatus).toBe(PaymentStatus.PAID);
    expect(db.reg.paymentId).toBe('pay_x');

    expect(db.tickets).toHaveLength(1); // one shared ticket
    expect(db.groupSeats).toHaveLength(3); // roster seeded on the paid path too
    expect(db.event.registeredCount).toBe(3);

    // soldCount is deliberately untouched by convert — the seat was held at offer.
    expect(db.ticketType.soldCount).toBe(10);
  });

  it('convert() never revives an offer cancelled meanwhile (its seat is already back)', async () => {
    const db = makeDb({
      ticketType: { price: 500, totalQuantity: 5, soldCount: 4 },
      reg: { quantity: 1, waitlistStatus: WaitlistStatus.OFFERED, status: 'CANCELLED' },
    });
    const { svc } = build(db);
    await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });
    expect(db.reg.status).toBe('CANCELLED');
    expect(db.tickets).toHaveLength(0);
    expect(db.event.registeredCount).toBe(0);
  });

  it('convert() is idempotent: a second call issues no duplicate ticket', async () => {
    const db = makeDb({
      ticketType: { price: 500, totalQuantity: 5, soldCount: 5 },
      reg: { quantity: 1, waitlistStatus: WaitlistStatus.OFFERED },
    });
    const { svc } = build(db);

    await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });
    const again = await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });

    // Second call short-circuits on the already-CONVERTED guard.
    expect(again.registration.waitlistStatus).toBe(WaitlistStatus.CONVERTED);
    expect(again.converted).toBe(false);
    expect(db.tickets).toHaveLength(1);
    expect(db.event.registeredCount).toBe(1);
  });

  it('convert() racing itself (verify vs webhook) counts the attendee once', async () => {
    const db = makeDb({
      ticketType: { price: 500, totalQuantity: 5, soldCount: 5 },
      reg: { quantity: 1, waitlistStatus: WaitlistStatus.OFFERED },
    });
    const { svc } = build(db);
    // Both callers read OFFERED before either writes.
    const stale = { ...db.reg };
    db.prisma.eventRegistration.findUnique = async () => ({ ...stale });

    const first = await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });
    const second = await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });

    // S52: only the winner reports a conversion, so only it sends the confirmation.
    expect([first.converted, second.converted]).toEqual([true, false]);
    expect(db.event.registeredCount).toBe(1);
    expect(db.tickets).toHaveLength(1);
  });

  it('join() creates the group seats with the waitlist row; convert() reuses them', async () => {
    const db = makeDb({
      ticketType: { price: 500, kind: 'GROUP', totalQuantity: 10, soldCount: 10 },
      reg: { quantity: 1 },
    });
    const { svc } = build(db);

    await svc.join(ATTENDEE, EVENT_ID, TT_ID, {
      quantity: 1,
      groupSize: 3,
      groupMembers: [{ name: 'Lead' }, { name: 'Bimal', email: 'b@x.in' }],
      qrCode: 'qr',
    });
    expect('groupMembers' in db.reg).toBe(false); // no JSON column write
    expect(db.groupSeats.map((s) => s.status)).toEqual([
      GroupSeatStatus.CLAIMED,
      GroupSeatStatus.CLAIMED,
      GroupSeatStatus.OPEN,
    ]);
    expect(db.groupSeats[1].memberDetails).toEqual({ name: 'Bimal', email: 'b@x.in' });

    db.reg.waitlistStatus = WaitlistStatus.OFFERED;
    await svc.convert('reg-1', { paymentId: 'pay_x', orderId: 'order_x' });
    expect(db.groupSeats).toHaveLength(3); // no duplicate seats
    expect(db.groupSeats[1].memberDetails).toEqual({ name: 'Bimal', email: 'b@x.in' });
  });
});
