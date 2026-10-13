import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RequestPayoutDto } from './dto';
import { PayoutsService } from './payouts.service';
import { EventFilterDto } from '../events/dto';

// S29: payout amounts and list limits are validated, and NaN never pays out.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const body = (metatype: unknown, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: metatype as never });

const EVENT = '11111111-1111-4111-8111-111111111111';

describe('RequestPayoutDto', () => {
  it('rejects a non-numeric amount (used to become NaN)', async () => {
    await expect(body(RequestPayoutDto, { eventId: EVENT, amount: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects zero / negative amounts and a non-uuid event', async () => {
    await expect(body(RequestPayoutDto, { eventId: EVENT, amount: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(RequestPayoutDto, { eventId: EVENT, amount: -5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(RequestPayoutDto, { eventId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts what the apps send', async () => {
    await expect(body(RequestPayoutDto, { eventId: EVENT })).resolves.toMatchObject({ eventId: EVENT });
    await expect(body(RequestPayoutDto, { eventId: EVENT, amount: 250.5, bankAccountId: EVENT })).resolves.toMatchObject({ amount: 250.5 });
  });
});

describe('EventFilterDto limit', () => {
  const query = (value: unknown) => pipe.transform(value, { type: 'query', metatype: EventFilterDto });
  it('caps limit at 100', async () => {
    await expect(query({ limit: '100' })).resolves.toMatchObject({ limit: 100 });
    await expect(query({ limit: '101' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PayoutsService.createPayout', () => {
  it('refuses a NaN amount even when it bypasses the DTO', async () => {
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: EVENT, createdBy: 'u1' }) },
      payoutBankAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      payout: { create: jest.fn() },
    };
    const svc = new PayoutsService(prisma as never, {} as never, {} as never);
    jest.spyOn(svc as never, 'computeBalance').mockResolvedValue({ available: 1000 } as never);
    await expect(
      svc.createPayout({ eventId: EVENT, bankAccountId: 'b1', netAmount: NaN }, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
});
