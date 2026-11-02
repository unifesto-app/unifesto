import { BadRequestException } from '@nestjs/common';
import { buildRegistrationsService } from './registrations.testing';
import { GroupSeatsService } from './group-seats.service';

/**
 * Z11 (DPDP): with PlatformConfig.requireAgeConfirmation on, self-registration
 * needs User.ageConfirmedAt. Off (the default) keeps 4.x apps working. The
 * organiser manual add/import path never calls create-order, so it is exempt
 * by construction; the last test pins that it does not read the flag.
 */
function setup(flag: boolean | null, ageConfirmedAt: Date | null) {
  const prisma: any = {
    // Stop right after the gate: a DRAFT event is refused by the next check.
    event: { findUnique: jest.fn(async () => ({ id: 'ev-1', spaceId: 'sp-1', visibility: 'PUBLIC', status: 'DRAFT', ticketTypes: [], registrations: [], space: { status: 'ACTIVE' } })) },
    space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) },
    platformConfig: { findUnique: jest.fn(async () => (flag === null ? null : { requireAgeConfirmation: flag })) },
    user: { findUnique: jest.fn(async () => ({ ageConfirmedAt })) },
  };
  const svc = buildRegistrationsService(
    prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, { emit: jest.fn() } as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, { can: async () => true } as any,
  );
  const order = () => svc.createPaymentOrder('ev-1', 'buyer', { ticketTypeId: 'tt-1', quantity: 1 } as any);
  return { svc, prisma, order };
}

describe('age confirmation gate (Z11)', () => {
  it('flag off: an unconfirmed user passes the gate', async () => {
    const { order, prisma } = setup(false, null);
    await expect(order()).rejects.toThrow('Event is not open for registration');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('no config row: treated as off', async () => {
    const { order } = setup(null, null);
    await expect(order()).rejects.toThrow('Event is not open for registration');
  });

  it('flag on: an unconfirmed user gets AGE_CONFIRMATION_REQUIRED', async () => {
    const { order } = setup(true, null);
    const err = await order().catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'AGE_CONFIRMATION_REQUIRED' });
  });

  it('flag on: a confirmed user passes', async () => {
    const { order } = setup(true, new Date());
    await expect(order()).rejects.toThrow('Event is not open for registration');
  });

  it('organiser manual add does not read the flag (guest path stays open)', async () => {
    const { svc, prisma } = setup(true, null);
    await svc.manualAddAttendee('ev-1', { ticketTypeId: 'tt-1', name: 'Kid', email: 'kid@example.com', gender: 'Male' }, 'curator').catch(() => undefined);
    expect(prisma.platformConfig.findUnique).not.toHaveBeenCalled();
  });
});

describe('age confirmation on group seat claims (Z11)', () => {
  const later = new Date(Date.now() + 86_400_000);
  const claim = (flag: boolean, ageConfirmedAt: Date | null) => {
    const prisma: any = {
      groupSeat: {
        findUnique: jest.fn(async () => ({
          id: 's-2',
          registrationId: 'r-1',
          seatIndex: 2,
          status: 'INVITED',
          inviteEmail: 'me@x.com',
          inviteToken: 'tok',
          claimedByUserId: null,
          memberDetails: null,
          registration: {
            id: 'r-1',
            eventId: 'e-1',
            ticketTypeId: null,
            status: 'REGISTERED',
            paymentStatus: 'PAID',
            event: { id: 'e-1', title: 'Hack', slug: 'hack', status: 'PUBLISHED', endDateTime: later, deletedAt: null },
          },
        })),
        findFirst: jest.fn(async () => null),
      },
      eventRegistration: { findFirst: jest.fn(async () => null) },
      platformConfig: { findUnique: jest.fn(async () => ({ requireAgeConfirmation: flag })) },
      user: { findUnique: jest.fn(async () => ({ ageConfirmedAt })) },
      // Stop right after the gate: the claimer's questions load next.
      eventFormField: {
        findMany: jest.fn(async () => {
          throw new Error('past the gate');
        }),
      },
    };
    return new GroupSeatsService(prisma, {} as any, {} as any).claim('tok', 'me', { name: 'Me' });
  };

  it('flag on: an unconfirmed claimer gets AGE_CONFIRMATION_REQUIRED', async () => {
    const err = await claim(true, null).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'AGE_CONFIRMATION_REQUIRED' });
  });

  it('flag on: a confirmed claimer passes', async () => {
    await expect(claim(true, new Date())).rejects.toThrow('past the gate');
  });

  it('flag off: an unconfirmed claimer passes', async () => {
    await expect(claim(false, null)).rejects.toThrow('past the gate');
  });
});
