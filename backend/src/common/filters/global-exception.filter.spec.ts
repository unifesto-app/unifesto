import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './global-exception.filter';

jest.mock('../observability', () => ({ reportError: jest.fn() }));

function run(exception: unknown) {
  const res = { locals: {}, status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { method: 'GET', url: '/careers/abc', path: '/careers/abc', headers: {} };
  new GlobalExceptionFilter().catch(exception, {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as any);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('GlobalExceptionFilter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('answers a malformed id (Prisma P2023) with 400, not a 500 that trips the alarm (J1)', () => {
    const badUuid = new Prisma.PrismaClientKnownRequestError('Error creating UUID, invalid character', {
      code: 'P2023',
      clientVersion: Prisma.prismaVersion.client,
    });
    expect(run(badUuid)).toMatchObject({ status: 400, body: { message: 'Invalid id' } });
  });

  it('keeps other unknown errors at 500 without leaking them', () => {
    expect(run(new Error('db down'))).toMatchObject({ status: 500, body: { message: 'Internal server error' } });
  });
});
