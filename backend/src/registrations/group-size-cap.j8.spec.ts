import { BadRequestException } from '@nestjs/common';
import { buildRegistrationsService } from './registrations.testing';
import { GroupSeatsService } from './group-seats.service';
import { WaitlistService } from './waitlist.service';
import { MAX_GROUP_SIZE, resolveGroupSize } from './registration.util';
import { rateCardTerms } from '../subscription/terms.testing';

jest.mock('./form-answers.policy', () => ({
  enforceFormAnswers: jest.fn(async () => undefined),
}));

/**
 * J8: groupSize was only @IsInt @Min(1). A sold-out GROUP ticket with a
 * waiting list passed the raw size to WaitlistService.join (one group_seats
 * row per person, so 50,000,000 OOMs a replica), and a non-GROUP ticket kept
 * whatever size the client sent.
 */

const EVENT = 'event-1';
const USER = 'user-1';
const HUGE = 50_000_000;

const groupTicket = {
  id: 'tt-g',
  kind: 'GROUP',
  price: 0,
  groupPricingMode: 'FLAT',
  minGroupSize: 2,
  maxGroupSize: null, // organiser left it unbounded
  isActive: true,
  isVisible: true,
  totalQuantity: 10,
  soldCount: 10, // sold out
  waitlistEnabled: true,
  perUserLimit: 5,
};
const rsvpTicket = {
  ...groupTicket,
  id: 'tt-r',
  kind: 'RSVP',
  minGroupSize: null,
  totalQuantity: null,
  soldCount: 0,
};

function build() {
  const created: any[] = [];
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => ({
        id: EVENT,
        spaceId: 'space-1',
        status: 'PUBLISHED',
        registrations: [],
        ticketTypes: [groupTicket, rsvpTicket],
      })),
      update: jest.fn(async () => ({})),
    },
    eventTicketType: {
      findUnique: jest.fn(async () => groupTicket),
      update: jest.fn(async () => ({})),
    },
    eventRegistration: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => {
        const reg = { id: `reg-${created.length}`, ...data };
        created.push(reg);
        return reg;
      }),
    },
    eventTicket: { create: jest.fn(async () => ({})) },
    groupSeat: {
      count: jest.fn(async () => 0),
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
    },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

  const payments = { priceSale: (b: number) => ({ base: b, fee: 0, total: b }) };
  const groupSeats = new GroupSeatsService(prisma, {} as any, {} as any);
  const waitlist = new WaitlistService(prisma, {} as any, payments as any, {} as any, groupSeats, {} as any, {} as any, rateCardTerms());
  const joinSpy = jest.spyOn(waitlist, 'join');
  const svc = buildRegistrationsService(
    prisma, {} as any, {} as any, { invalidateCheckinCache: jest.fn() } as any, {} as any, {} as any,
    payments as any, waitlist, { emit: jest.fn() } as any, groupSeats, {} as any,
    {} as any, {} as any, {} as any, { can: async () => true } as any,
  );
  (svc.checkout as any).assertMayRegister = jest.fn();
  (svc.checkout as any).assertTicketNotBlocked = jest.fn();
  (svc.checkout as any).confirmations = { sendRegistrationConfirmations: jest.fn(async () => undefined) };
  return { svc, prisma, waitlist, joinSpy, created };
}

describe('group size cap (J8)', () => {
  it('resolveGroupSize: null for non-GROUP, bounded for GROUP', () => {
    expect(resolveGroupSize(rsvpTicket, HUGE)).toBeNull();
    expect(resolveGroupSize(groupTicket, 3)).toBe(3);
    expect(resolveGroupSize(groupTicket, undefined)).toBe(2);
    expect(() => resolveGroupSize(groupTicket, 1)).toThrow(BadRequestException);
    expect(() => resolveGroupSize(groupTicket, MAX_GROUP_SIZE + 1)).toThrow(BadRequestException);
    expect(() => resolveGroupSize({ ...groupTicket, maxGroupSize: 500 }, 200)).toThrow(BadRequestException);
  });

  it('a sold-out GROUP ticket rejects a huge size before the waiting list', async () => {
    const { svc, joinSpy, prisma } = build();
    await expect(
      svc.createPaymentOrder(EVENT, USER, { ticketTypeId: 'tt-g', quantity: 1, groupSize: HUGE } as any),
    ).rejects.toThrow(BadRequestException);
    expect(joinSpy).not.toHaveBeenCalled();
    expect(prisma.groupSeat.createMany).not.toHaveBeenCalled();
  });

  it('WaitlistService.join rejects a huge size on its own', async () => {
    const { waitlist, prisma } = build();
    await expect(
      waitlist.join(USER, EVENT, 'tt-g', { quantity: 1, groupSize: HUGE, qrCode: 'qr' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
  });

  it('a non-GROUP ticket ignores the client groupSize and takes one seat', async () => {
    const { svc, prisma, created } = build();
    await svc.createPaymentOrder(EVENT, USER, { ticketTypeId: 'tt-r', quantity: 1, groupSize: HUGE } as any);
    expect(created[0].groupSize).toBeNull();
    expect(prisma.groupSeat.createMany).not.toHaveBeenCalled();
  });

  it('createSeatsForRegistration refuses more than MAX_GROUP_SIZE seats', async () => {
    const { prisma } = build();
    const groupSeats = new GroupSeatsService(prisma, {} as any, {} as any);
    await expect(
      groupSeats.createSeatsForRegistration(prisma, { registrationId: 'r', leadUserId: USER, seatCount: HUGE }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.groupSeat.createMany).not.toHaveBeenCalled();
  });
});
