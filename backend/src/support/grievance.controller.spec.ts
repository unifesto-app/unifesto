import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GrievanceController } from './grievance.controller';

function setup(otp: 'ok' | 'invalid' | 'blocked', identity: { userId: string } | null = { userId: 'u-1' }) {
  // ILIKE hits: the identity (if any) under its stored email.
  const prisma: any = {
    userIdentity: { findMany: jest.fn(async () => (identity ? [{ ...identity, email: 'Me@Example.com' }] : [])) },
  };
  const otpService: any = { verifyOtp: jest.fn(async () => otp) };
  const support: any = { createTicket: jest.fn(async () => ({ ticketNumber: 1042 })) };
  return { prisma, support, controller: new GrievanceController(prisma, otpService, support) };
}

const dto = { email: 'me@example.com', otp: '123456', subject: 'Refund ignored', message: 'Nobody answered.' };

describe('GrievanceController (D25)', () => {
  it('opens a GRIEVANCE case for the account behind a proven email', async () => {
    const { support, controller } = setup('ok');
    await expect(controller.create(dto, '1.2.3.4')).resolves.toEqual({ ticketNumber: 1042 });
    expect(support.createTicket).toHaveBeenCalledWith(
      { kind: 'GRIEVANCE', subject: 'Refund ignored', message: 'Nobody answered.', contactEmail: 'me@example.com' },
      'u-1',
    );
  });

  it('refuses a wrong code before looking up anyone', async () => {
    for (const r of ['invalid', 'blocked'] as const) {
      const { prisma, controller } = setup(r);
      await expect(controller.create(dto, '1.2.3.4')).rejects.toThrow(UnauthorizedException);
      expect(prisma.userIdentity.findMany).not.toHaveBeenCalled();
    }
  });

  it('points an email with no account to the Grievance Officer', async () => {
    const { support, controller } = setup('ok', null);
    await expect(controller.create(dto, '1.2.3.4')).rejects.toThrow(NotFoundException);
    expect(support.createTicket).not.toHaveBeenCalled();
  });

  it('ignores an ILIKE wildcard hit (`_` matched another address)', async () => {
    const { prisma, support, controller } = setup('ok');
    prisma.userIdentity.findMany.mockResolvedValue([{ userId: 'u-other', email: 'meXexample@example.com' }]);
    await expect(controller.create({ ...dto, email: 'me_example@example.com' }, '1.2.3.4')).rejects.toThrow(
      NotFoundException,
    );
    expect(support.createTicket).not.toHaveBeenCalled();
  });
});
