import { GroupSeatStatus, PaymentStatus, RegistrationStatus } from '@prisma/client';
import { buildRegistrationsService } from './registrations.testing';
import { GroupSeatsService } from './group-seats.service';

jest.mock('./form-answers.policy', () => ({
  enforceFormAnswers: jest.fn(async () => undefined),
}));

/**
 * S42: a paid group checkout writes its typed-in members straight onto
 * GroupSeat rows, in the same transaction as the PENDING registration (no
 * `group_members` JSON). Confirmation (verify, webhook, both racing) then
 * proceeds with those seats and never creates a second set.
 */

const EVENT = 'event-1';
const USER = 'lead-1';
const members = [
  { name: 'Lead', email: 'lead@x.in', mobile: '9000000001' },
  { name: 'Bimal', email: 'bimal@x.in', mobile: '9000000002' },
];

function build() {
  const seats: any[] = [];
  let reg: any = null;
  let txDepth = 0;
  const writesInTx: string[] = [];
  const track = (name: string) => {
    if (txDepth > 0) writesInTx.push(name);
  };

  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => ({
        id: EVENT,
        spaceId: 'space-1',
        status: 'PUBLISHED',
        isRecurring: false,
        registrations: [],
        ticketTypes: [
          {
            id: 'tt-1',
            kind: 'GROUP',
            price: 300,
            groupPricingMode: 'FLAT',
            minGroupSize: 2,
            maxGroupSize: 4,
            isActive: true,
            isVisible: true,
            totalQuantity: null,
            soldCount: 0,
            perUserLimit: 5,
          },
        ],
      })),
      update: jest.fn(async () => ({})),
    },
    eventRegistration: {
      create: jest.fn(async ({ data }: any) => {
        track('eventRegistration.create');
        reg = { id: 'reg-new', status: RegistrationStatus.REGISTERED, ...data };
        return reg;
      }),
      findUnique: jest.fn(async () => (reg ? { ...reg, event: { id: EVENT }, user: {} } : null)),
      update: jest.fn(async ({ data }: any) => Object.assign(reg, data)),
      updateMany: jest.fn(async ({ data }: any) => {
        // The atomic PENDING → PAID claim: only the first caller wins.
        if (reg.paymentStatus === PaymentStatus.PAID) return { count: 0 };
        Object.assign(reg, data);
        return { count: 1 };
      }),
    },
    eventTicket: {
      create: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
    },
    eventTicketType: { update: jest.fn(async () => ({})) },
    groupSeat: {
      count: jest.fn(async ({ where }: any) => seats.filter((s) => s.registrationId === where.registrationId).length),
      createMany: jest.fn(async ({ data }: any) => {
        track('groupSeat.createMany');
        seats.push(...data);
        return { count: data.length };
      }),
    },
    userIdentity: { findFirst: jest.fn(async () => null) },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (fn: any) => {
    txDepth++;
    try {
      return await fn(prisma);
    } finally {
      txDepth--;
    }
  });

  const payments = {
    computeProcessingFee: () => 0,
    createOrder: jest.fn(async () => ({ orderId: 'order_1', amount: 30000, currency: 'INR' })),
    verifyPaymentSignature: jest.fn(() => true),
  };
  const coupons = {
    releaseByRegistration: jest.fn(async () => undefined),
    confirmByRegistration: jest.fn(async () => undefined),
  };
  const cache = { redis: { getClient: () => null }, invalidateCheckinCache: jest.fn(), incrementEventScore: jest.fn() };
  const groupSeats = new GroupSeatsService(prisma, {} as any, {} as any);
  const svc = buildRegistrationsService(
    prisma, {} as any, {} as any, cache as any, {} as any, {} as any,
    payments as any, {} as any, { emit: jest.fn() } as any, groupSeats, {} as any,
    coupons as any, {} as any, {} as any, { can: async () => true } as any,
  );
  (svc.checkout as any).assertMayRegister = jest.fn();
  (svc.checkout as any).assertTicketNotBlocked = jest.fn();
  return { svc, prisma, seats, writesInTx, getReg: () => reg };
}

const checkout = (svc: any) =>
  svc.createPaymentOrder(EVENT, USER, { ticketTypeId: 'tt-1', quantity: 1, groupSize: 3, groupMembers: members });

const verifyDto = { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' } as any;

describe('group seats at checkout (S42)', () => {
  it('paid checkout creates the seats in the PENDING registration transaction, no JSON', async () => {
    const { svc, seats, writesInTx, getReg } = build();
    await checkout(svc);

    expect(getReg().paymentStatus).toBe(PaymentStatus.PENDING);
    expect('groupMembers' in getReg()).toBe(false);
    expect(writesInTx).toEqual(['eventRegistration.create', 'groupSeat.createMany']);
    expect(seats.map((s) => [s.seatIndex, s.status])).toEqual([
      [1, GroupSeatStatus.CLAIMED],
      [2, GroupSeatStatus.CLAIMED],
      [3, GroupSeatStatus.OPEN],
    ]);
    expect(seats[0].claimedByUserId).toBe(USER);
    expect(seats[1]).toMatchObject({ claimedByUserId: null, memberDetails: members[1] });
  });

  it('verify then the racing webhook confirm the existing seats without duplicating them', async () => {
    const { svc, prisma, seats } = build();
    await checkout(svc);

    await svc.verifyPayment(EVENT, USER, verifyDto).catch(() => undefined);
    await (svc.settlement as any).completeWebhookPayment('reg-new', 'pay_1', 'order_1').catch(() => undefined);

    expect(seats).toHaveLength(3);
    expect(prisma.groupSeat.createMany).toHaveBeenCalledTimes(1);
    expect(seats[1].memberDetails).toEqual(members[1]);
  });

  it('webhook alone (app never returned) also keeps the one set of seats', async () => {
    const { svc, prisma, seats, getReg } = build();
    await checkout(svc);

    await (svc.settlement as any).completeWebhookPayment('reg-new', 'pay_1', 'order_1').catch(() => undefined);

    expect(getReg().paymentStatus).toBe(PaymentStatus.PAID);
    expect(seats).toHaveLength(3);
    expect(prisma.groupSeat.createMany).toHaveBeenCalledTimes(1);
  });
});
