import { EventEmitter } from 'events';
import * as jwt from 'jsonwebtoken';
import { ENGAGEMENT_PING_MS, LeaderboardGateway, msUntilExpiry } from './leaderboard.gateway';

// S36: socket auth in middleware, expiry disconnect, snapshot cache.
describe('LeaderboardGateway', () => {
  const build = (redisStore: Record<string, string> = {}, prisma: unknown = {}, authz: unknown = {}) => {
    const auth = { validateAccessToken: jest.fn().mockResolvedValue({ id: 'u1' }) };
    const leaderboard = { getPublicSnapshot: jest.fn().mockResolvedValue({ id: 'b1' }) };
    const redis = {
      get: jest.fn(async (k: string) => redisStore[k] ?? null),
      set: jest.fn(async (k: string, v: string) => {
        redisStore[k] = v;
      }),
    };
    const gw = new LeaderboardGateway(auth as never, leaderboard as never, redis as never, prisma as never, authz as never);
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

  // L1: the engagement room admits attendees and operators only.
  describe('engagement room', () => {
    const access = (opts: { regs?: number; seats?: number; operator?: boolean }) => {
      const prisma = {
        eventRegistration: { count: jest.fn().mockResolvedValue(opts.regs ?? 0) },
        groupSeat: { count: jest.fn().mockResolvedValue(opts.seats ?? 0) },
      };
      const authz = { can: jest.fn().mockResolvedValue(!!opts.operator) };
      const { gw } = build({}, prisma, authz);
      const s = Object.assign(socket(), { userId: 'u1' as string | null, join: jest.fn() });
      return { gw, s, authz };
    };

    it('lets an attendee in', async () => {
      const { gw, s } = access({ regs: 1 });
      expect(await gw.onEngagementSubscribe(s as never, { eventId: 'e1' })).toEqual({ ok: true });
      expect(s.join).toHaveBeenCalledWith('eng:e1');
    });

    it('lets a group member with a claimed seat in', async () => {
      const { gw, s } = access({ seats: 1 });
      expect(await gw.onEngagementSubscribe(s as never, { eventId: 'e1' })).toEqual({ ok: true });
    });

    it('lets an operator in by event:view', async () => {
      const { gw, s, authz } = access({ operator: true });
      expect(await gw.onEngagementSubscribe(s as never, { eventId: 'e1' })).toEqual({ ok: true });
      expect(authz.can).toHaveBeenCalledWith({ id: 'u1' }, 'event:view', { eventId: 'e1' });
    });

    it('turns away someone not registered', async () => {
      const { gw, s } = access({});
      expect(await gw.onEngagementSubscribe(s as never, { eventId: 'e1' })).toEqual({ error: 'not_authorized' });
      expect(s.join).not.toHaveBeenCalled();
    });

    it('turns away an anonymous socket', async () => {
      const { gw, s } = access({ regs: 1 });
      s.userId = null;
      expect(await gw.onEngagementSubscribe(s as never, { eventId: 'e1' })).toEqual({ error: 'not_authorized' });
    });

    it('coalesces a burst of changes into one ping', () => {
      jest.useFakeTimers();
      try {
        const { gw } = build();
        const emit = jest.fn();
        gw.server = { to: jest.fn(() => ({ emit })) } as never;
        for (let i = 0; i < 50; i++) gw.engagementChanged('e1');
        jest.advanceTimersByTime(ENGAGEMENT_PING_MS);
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('engagement:changed', { eventId: 'e1' });
        gw.engagementChanged('e1');
        jest.advanceTimersByTime(ENGAGEMENT_PING_MS);
        expect(emit).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('sends an immediate ping at once (L3: a quiz question is on a clock)', () => {
      const { gw } = build();
      const emit = jest.fn();
      gw.server = { to: jest.fn(() => ({ emit })) } as never;
      gw.engagementChanged('e1', true);
      expect(emit).toHaveBeenCalledWith('engagement:changed', { eventId: 'e1' });
    });
  });
});
