import { EventEmitter } from 'events';
import * as jwt from 'jsonwebtoken';
import { LeaderboardGateway, msUntilExpiry } from './leaderboard.gateway';

// S36: socket auth in middleware, expiry disconnect, snapshot cache.
describe('LeaderboardGateway', () => {
  const build = (redisStore: Record<string, string> = {}) => {
    const auth = { validateAccessToken: jest.fn().mockResolvedValue({ id: 'u1' }) };
    const leaderboard = { getPublicSnapshot: jest.fn().mockResolvedValue({ id: 'b1' }) };
    const redis = {
      get: jest.fn(async (k: string) => redisStore[k] ?? null),
      set: jest.fn(async (k: string, v: string) => {
        redisStore[k] = v;
      }),
    };
    const gw = new LeaderboardGateway(auth as never, leaderboard as never, redis as never);
    return { gw, auth, leaderboard, redis };
  };

  const socket = (token?: string) => {
    const s = new EventEmitter() as EventEmitter & Record<string, any>;
    s.handshake = { auth: token ? { token } : {}, headers: {} };
    s.disconnect = jest.fn();
    return s;
  };

  it('settles userId in namespace middleware before calling next()', async () => {
    const { gw } = build();
    let mw: (s: unknown, next: () => void) => void = () => undefined;
    gw.afterInit({ use: (fn: typeof mw) => (mw = fn) } as never);
    const s = socket(jwt.sign({ userId: 'u1' }, 'k', { expiresIn: '1h' }));
    await new Promise<void>((resolve) => mw(s, resolve));
    expect(s.userId).toBe('u1');
  });

  it('disconnects the socket when the access token expires', async () => {
    jest.useFakeTimers();
    try {
      const { gw } = build();
      const s = socket(jwt.sign({ userId: 'u1' }, 'k', { expiresIn: 60 }));
      await gw.authenticate(s as never);
      jest.advanceTimersByTime(59_000);
      expect(s.disconnect).not.toHaveBeenCalled();
      jest.advanceTimersByTime(2_000);
      expect(s.disconnect).toHaveBeenCalledWith(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a bad-token socket anonymous', async () => {
    const { gw, auth } = build();
    auth.validateAccessToken.mockRejectedValue(new Error('bad'));
    const s = socket('garbage');
    await gw.authenticate(s as never);
    expect(s.userId).toBeNull();
  });

  it('serves repeat snapshots from the cache', async () => {
    const { gw, leaderboard } = build();
    await gw.cachedSnapshot('e1');
    await gw.cachedSnapshot('e1');
    expect(leaderboard.getPublicSnapshot).toHaveBeenCalledTimes(1);
  });

  it('msUntilExpiry is null for tokens without exp', () => {
    expect(msUntilExpiry(jwt.sign({ userId: 'u' }, 'k'))).toBeNull();
  });
});
