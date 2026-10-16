import { ForbiddenException } from '@nestjs/common';
import { MyRegistrationsService } from './my-registrations.service';

// Check-in history is per registration: the owner and teammates who claimed a
// seat on it may read it; anyone else is refused.
describe('MyRegistrationsService.getMyRegistrationCheckins', () => {
  const build = (seat: object | null) => {
    const prisma = {
      eventRegistration: { findUnique: jest.fn().mockResolvedValue({ userId: 'lead' }) },
      groupSeat: { findFirst: jest.fn().mockResolvedValue(seat) },
      eventCheckinRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return new MyRegistrationsService(prisma as never, {} as never, {} as never);
  };

  it('lets the owner read', async () => {
    await expect(build(null).getMyRegistrationCheckins('lead', 'r1')).resolves.toEqual([]);
  });

  it('lets a teammate with a claimed seat read', async () => {
    await expect(build({ id: 's1' }).getMyRegistrationCheckins('mate', 'r1')).resolves.toEqual([]);
  });

  it('refuses anyone else with 403', async () => {
    await expect(build(null).getMyRegistrationCheckins('stranger', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
