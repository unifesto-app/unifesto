import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserAwareThrottlerGuard } from './user-aware-throttler.guard';

const ctx = (type: string, req: object) =>
  ({
    getType: () => type,
    getHandler: () => function onEngagementSubscribe() {},
    getClass: () => class LeaderboardGateway {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  }) as unknown as ExecutionContext;

describe('UserAwareThrottlerGuard (J6)', () => {
  const increment = jest.fn().mockResolvedValue({
    totalHits: 1,
    timeToExpire: 60,
    isBlocked: false,
    timeToBlockExpire: 0,
  });
  const guard = new UserAwareThrottlerGuard(
    { throttlers: [{ ttl: 60_000, limit: 300 }] },
    { increment },
    new Reflector(),
    { resolveUserId: jest.fn() } as never,
  );

  beforeAll(() => guard.onModuleInit());
  beforeEach(() => increment.mockClear());

  it('never counts socket messages (they would all share ip:undefined)', async () => {
    await expect(guard.canActivate(ctx('ws', {}))).resolves.toBe(true);
    expect(increment).not.toHaveBeenCalled();
  });

  it('still counts HTTP requests', async () => {
    await expect(
      guard.canActivate(ctx('http', { ip: '1.2.3.4', headers: {} })),
    ).resolves.toBe(true);
    expect(increment).toHaveBeenCalledTimes(1);
  });
});
