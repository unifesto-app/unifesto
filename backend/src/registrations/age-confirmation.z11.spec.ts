import { BadRequestException } from '@nestjs/common';
import { buildRegistrationsService } from './registrations.testing';

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
