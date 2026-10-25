/// <reference types="jest" />
import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';

/**
 * S4–S8 regression specs: identity takeover via non-temp tokens, email
 * auto-link without verification, refresh/access token confusion and replay,
 * OTP brute force, and the App Review bypass.
 */

const SECRET = 'test-secret';

/** Minimal in-memory stand-in for the ioredis commands OtpService uses. */
function fakeRedisClient() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    store,
    ttls,
    async get(k: string) {
      await tick();
      return store.get(k) ?? null;
    },
    async set(k: string, v: string, ...args: any[]) {
      await tick();
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
    async setex(k: string, _ttl: number, v: string) {
      await tick();
      store.set(k, v);
      return 'OK';
    },
    async incr(k: string) {
      await tick();
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    async decr(k: string) {
      await tick();
      const n = Number(store.get(k) ?? 0) - 1;
      store.set(k, String(n));
      return n;
    },
    async expire(k: string, ttl: number) {
      await tick();
      ttls.set(k, ttl);
      return 1;
    },
    async ttl(k: string) {
      await tick();
      return store.has(k) ? (ttls.get(k) ?? -1) : -2;
    },
    async del(k: string) {
      await tick();
      ttls.delete(k);
      return store.delete(k) ? 1 : 0;
    },
  };
}

function fakeRedisService(client = fakeRedisClient()) {
  return {
    client,
    getClient: () => client,
    get: (k: string) => client.get(k),
    set: (k: string, v: string, ttl?: number) => client.setex(k, ttl ?? 0, v),
    del: (k: string) => client.del(k),
    setNx: async (k: string, v: string, ttl: number) =>
      (await client.set(k, v, 'EX', ttl, 'NX')) === 'OK',
  };
}

const user = (over: Record<string, any> = {}) => ({
  id: 'user-1',
  mobileNumber: '+919999999999',
  mobileVerified: true,
  username: null,
  fullName: null,
  avatarUrl: null,
  bio: null,
  gender: null,
  linkedinUrl: null,
  instagramUrl: null,
  githubUrl: null,
  websiteUrl: null,
  createdAt: new Date(),
  deletionRequestedAt: null,
  deletedAt: null,
  tokenVersion: 0,
  ...over,
});

function setup(env: Record<string, string> = {}) {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
    ...Object.fromEntries(
      [
        'leaderboardEntrant',
        'leaderboardPanelist',
        'leaderboardScore',
        'leaderboardJudgment',
        'hackathonJudgeProfile',
        'hackathonPanelMember',
        'hackathonEvalRequest',
      ].map((m) => [m, { count: jest.fn().mockResolvedValue(0) }]),
    ),
    platformConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  const config: any = {
    get: (k: string, d?: any) => ({ JWT_SECRET: SECRET, ...env })[k] ?? d,
  };
  const otp: any = {
    generateOtp: jest.fn(() => '123456'),
    storeOtp: jest.fn(),
    assertCanSend: jest.fn(),
    releaseSend: jest.fn().mockResolvedValue(undefined),
    verifyOtp: jest.fn().mockResolvedValue('ok'),
  };
  const redis = fakeRedisService();
  const cognito: any = { verifyCognitoToken: jest.fn() };
  const email: any = { sendOtpEmail: jest.fn().mockResolvedValue(true), sendWelcomeEmail: jest.fn().mockResolvedValue(undefined), sendSignInMethodAdded: jest.fn().mockResolvedValue(undefined) };
  const whatsapp: any = { sendOtp: jest.fn().mockResolvedValue(true) };
  const service = new AuthService(prisma, config, email, whatsapp, otp, redis as any, cognito);
  return { service, prisma, otp, redis, cognito, email, whatsapp };
}

const sign = (payload: object, expiresIn: any = '1h') =>
  jwt.sign(payload, SECRET, { expiresIn });

describe('S4: temp token is required for mobile verification', () => {
  const dto = (tempToken: string) => ({
    mobileNumber: '+919999999999',
    otp: '123456',
    tempToken,
  });

  it.each([
    ['access token', { userId: 'attacker' }],
    ['refresh token', { userId: 'attacker', type: 'refresh' }],
    ['temp-typed token with no provider fields', { type: 'temp' }],
    ['temp-typed token with empty providerUserId', { type: 'temp', provider: 'GOOGLE', providerUserId: '' }],
    ['legacy untyped temp token', { provider: 'GOOGLE', providerUserId: 'g-1' }],
  ])('rejects a %s and never touches identities', async (_n, payload) => {
    const { service, prisma } = setup();
    prisma.userIdentity.findFirst.mockResolvedValue({ user: user({ mobileVerified: false }) });
    prisma.user.findUnique.mockResolvedValue(user());

    await expect(service.verifyMobile(dto(sign(payload)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.userIdentity.updateMany).not.toHaveBeenCalled();
    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
  });

  it('send-otp refuses an access token too', async () => {
    const { service, otp } = setup();
    await expect(
      service.sendMobileOtp({ mobileNumber: '+919999999999', tempToken: sign({ userId: 'x' }) }),
    ).rejects.toBeDefined();
    expect(otp.storeOtp).not.toHaveBeenCalled();
  });

  it('moves only the token identity, by unique key, for a real temp token', async () => {
    const { service, prisma } = setup();
    const placeholder = user({ id: 'placeholder', mobileVerified: false });
    prisma.userIdentity.findUnique.mockResolvedValue({ user: placeholder });
    prisma.user.findUnique
      .mockResolvedValueOnce(user({ id: 'owner' }))
      .mockResolvedValueOnce(freshPlaceholder());
    const temp = sign({ type: 'temp', provider: 'GOOGLE', providerUserId: 'g-1' }, '15m');

    const res = await service.verifyMobile(dto(temp));

    expect(res.user.id).toBe('owner');
    expect(prisma.userIdentity.updateMany).not.toHaveBeenCalled();
    expect(prisma.userIdentity.update).toHaveBeenCalledWith({
      where: { unique_provider_user: { provider: 'GOOGLE', providerUserId: 'g-1' } },
      data: { userId: 'owner' },
    });
  });
});

/** What the S48 probe returns for a just-minted Cognito placeholder. */
const freshPlaceholder = (over: Record<string, any> = {}) => ({
  mobileNumber: '+0123456789',
  mobileVerified: false,
  fullName: null,
  identities: [{ provider: 'GOOGLE' }],
  _count: { registrations: 0, roles: 0 },
  referredBy: null,
  notificationSettings: null,
  ...over,
});

describe('S48: verify-mobile never deletes a real account', () => {
  const temp = (provider = 'GOOGLE') =>
    sign({ type: 'temp', provider, providerUserId: 'p-1' }, '15m');
  const dto = (provider?: string) => ({
    mobileNumber: '+919999999999',
    otp: '123456',
    tempToken: temp(provider),
  });
  const arrange = (probe: any, provider = 'GOOGLE') => {
    const ctx = setup();
    ctx.prisma.userIdentity.findUnique.mockResolvedValue({
      user: user({ id: 'from', mobileVerified: false }),
    });
    ctx.prisma.user.findUnique
      .mockResolvedValueOnce(user({ id: 'owner' }))
      .mockResolvedValueOnce(probe);
    return { ...ctx, call: () => ctx.service.verifyMobile(dto(provider)) };
  };

  it('deletes an empty Cognito placeholder and signs into the mobile owner', async () => {
    const { prisma, call } = arrange(freshPlaceholder());
    const res = await call();
    expect(res.user.id).toBe('owner');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'from' } });
  });

  it.each([
    ['has registrations', freshPlaceholder({ _count: { registrations: 2 } })],
    ['has another identity', freshPlaceholder({ identities: [{ provider: 'GOOGLE' }, { provider: 'EMAIL' }] })],
    ['has a real mobile', freshPlaceholder({ mobileNumber: '+918888888888' })],
    ['has a name (manual add / judge invite)', freshPlaceholder({ fullName: 'Asha' })],
    ['has a 1:1 relation row', freshPlaceholder({ notificationSettings: { id: 'n' } })],
  ])('refuses with 409 when the source account %s', async (_n, probe) => {
    const { prisma, call } = arrange(probe);
    await expect(call()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
  });

  it('refuses for an email-OTP account (EMAIL identity)', async () => {
    const { prisma, call } = arrange(freshPlaceholder({ identities: [{ provider: 'EMAIL' }] }), 'EMAIL');
    await expect(call()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses when a hackathon table references the account', async () => {
    const { prisma, call } = arrange(freshPlaceholder());
    prisma.hackathonJudgeProfile.count.mockResolvedValue(1);
    await expect(call()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('does not swallow a failed delete', async () => {
    const { prisma, call } = arrange(freshPlaceholder());
    prisma.user.delete.mockRejectedValue(new Error('fk'));
    await expect(call()).rejects.toBeDefined();
  });

  it('verifying your own unverified number just marks it verified', async () => {
    const { service, prisma } = setup();
    const self = user({ id: 'self', mobileVerified: false });
    prisma.userIdentity.findUnique.mockResolvedValue({ user: self });
    prisma.user.findUnique.mockResolvedValue(self);
    prisma.user.update.mockResolvedValue({ ...self, mobileVerified: true });
    const res = await service.verifyMobile(dto());
    expect(res.user.id).toBe('self');
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

describe('S5: email auto-link needs a verified email', () => {
  it('does not link an Apple login with an unverified email to the existing account', async () => {
    const { service, prisma } = setup();
    (service as any).verifyAppleToken = jest
      .fn()
      .mockResolvedValue({ sub: 'apple-attacker', email: 'victim@x.com', email_verified: false });
    prisma.userIdentity.findMany.mockResolvedValue([{ email: 'victim@x.com', user: user({ id: 'victim' }) }]);

    const res = await service.loginWithApple({ identityToken: 't' } as any);

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(res.accessToken).toBe('');
    expect(res.refreshToken).toBeUndefined();
    expect(res.requiresMobileVerification).toBe(true);
    expect(res.user).toBeNull();
  });

  it('links when the IdP says verified (Apple sends the string "true")', async () => {
    const { service, prisma } = setup();
    (service as any).verifyAppleToken = jest
      .fn()
      .mockResolvedValue({ sub: 'apple-1', email: 'me@x.com', email_verified: 'true' });
    prisma.userIdentity.findMany.mockResolvedValue([{ email: 'me@x.com', user: user({ id: 'me' }) }]);

    const res = await service.loginWithApple({ identityToken: 't' } as any);

    expect(prisma.userIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailVerified: true, email: { equals: 'me@x.com', mode: 'insensitive' } },
      }),
    );
    expect(prisma.userIdentity.create).toHaveBeenCalled();
    expect(res.accessToken).not.toBe('');
  });

  it('J17: emails the account when a new sign-in method is linked, not on a re-link', async () => {
    const { service, prisma, email } = setup();
    prisma.userIdentity.findMany.mockResolvedValue([{ email: 'Me@x.com' }, { email: 'me@x.com' }]);
    await (service as any).linkIdentityToUser('me', 'GOOGLE', 'g-1', 'me@x.com', true);
    await new Promise((r) => setImmediate(r));
    expect(email.sendSignInMethodAdded).toHaveBeenCalledTimes(1);
    expect(email.sendSignInMethodAdded).toHaveBeenCalledWith('me@x.com', 'Google');

    email.sendSignInMethodAdded.mockClear();
    prisma.userIdentity.create.mockRejectedValueOnce(new Error('P2002'));
    await (service as any).linkIdentityToUser('me', 'GOOGLE', 'g-1', 'me@x.com', true);
    await new Promise((r) => setImmediate(r));
    expect(email.sendSignInMethodAdded).not.toHaveBeenCalled();
  });

  it('Cognito: unverified email creates a placeholder instead of linking', async () => {
    const { service, prisma, cognito } = setup();
    cognito.verifyCognitoToken.mockResolvedValue({
      sub: 'cog-1',
      email: 'victim@x.com',
      email_verified: false,
    });
    prisma.userIdentity.findFirst.mockImplementation(({ where }: any) =>
      where.providerUserId === 'cog-1' ? null : { user: user({ id: 'victim', roles: [] }) },
    );
    prisma.user.create.mockResolvedValue(user({ id: 'placeholder', mobileVerified: false, roles: [] }));

    const res = await service.loginWithCognito('id-token');

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(res.accessToken).toBe('');
    expect(res.user?.id).toBe('placeholder');
    expect(prisma.user.create.mock.calls[0][0].data.identities.create.emailVerified).toBe(false);
  });
});

describe('S6: token types, tokenVersion and refresh revocation', () => {
  it('rejects a refresh token used as an access token', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    await expect(
      service.validateAccessToken(sign({ userId: 'user-1', type: 'refresh' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a temp token used as an access token', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    await expect(
      service.validateAccessToken(sign({ type: 'temp', provider: 'GOOGLE', providerUserId: 'g' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('still accepts a pre-S6 access token ({ userId } only)', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    await expect(service.validateAccessToken(sign({ userId: 'user-1' }))).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  it('rejects an access token from an older tokenVersion', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ tokenVersion: 1 }));
    await expect(
      service.validateAccessToken(sign({ userId: 'user-1', type: 'access', tv: 0 })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /** Pretend the token was rotated `ms` ago. */
  const spentAgo = (redis: any, id: string, ms: number) =>
    redis.client.store.set(`auth:refresh:spent:${id}`, String(Date.now() - ms));

  it('a rotated refresh token is dead once the retry grace window passes', async () => {
    const { service, prisma, redis } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    const rt = sign({ userId: 'user-1', type: 'refresh', tv: 0, jti: 'j1' });

    const first = await service.refreshSession(rt);
    expect(jwt.decode(first.refreshToken)).toMatchObject({ type: 'refresh', jti: expect.any(String) });
    expect(jwt.decode(first.accessToken)).toMatchObject({ type: 'access', tv: 0 });
    // A client retrying a rotate whose response it lost is not logged out.
    await expect(service.refreshSession(rt)).resolves.toHaveProperty('accessToken');

    spentAgo(redis, 'j1', 5 * 60 * 1000);
    await expect(service.refreshSession(rt)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('keeps a 4.0.5 refresh token (no jti/tv) working once, then it is spent', async () => {
    const { service, prisma, redis } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    const legacy = sign({ userId: 'user-1', type: 'refresh' }, '180d');

    await expect(service.refreshSession(legacy)).resolves.toHaveProperty('accessToken');
    const [key] = [...redis.client.store.keys()].filter((k) => k.startsWith('auth:refresh:spent:h:'));
    expect(key).toBeDefined();
    redis.client.store.set(key, String(Date.now() - 5 * 60 * 1000));
    await expect(service.refreshSession(legacy)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout with the refresh token revokes it', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    const rt = sign({ userId: 'user-1', type: 'refresh', tv: 0, jti: 'j2' });

    await service.logout('user-1', { refreshToken: rt });
    await expect(service.refreshSession(rt)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout also kills a token still inside its rotate grace window', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    const rt = sign({ userId: 'user-1', type: 'refresh', tv: 0, jti: 'j5' });

    await service.refreshSession(rt);
    await service.logout('user-1', { refreshToken: rt });
    await expect(service.refreshSession(rt)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("logout can't revoke someone else's refresh token", async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'victim' }));
    const rt = sign({ userId: 'victim', type: 'refresh', tv: 0, jti: 'j3' });

    await service.logout('attacker', { refreshToken: rt });
    await expect(service.refreshSession(rt)).resolves.toHaveProperty('accessToken');
  });

  it('logout allDevices bumps tokenVersion; a refresh from the old version fails', async () => {
    const { service, prisma } = setup();
    await service.logout('user-1', { allDevices: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    prisma.user.findUnique.mockResolvedValue(user({ tokenVersion: 1 }));
    await expect(
      service.refreshSession(sign({ userId: 'user-1', type: 'refresh', tv: 0, jti: 'j4' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('S7: OTP brute force', () => {
  const make = () => {
    const redis = fakeRedisService();
    return { otp: new OtpService(redis as any), redis };
  };

  it('codes come from crypto, not Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    const { otp } = make();
    const code = otp.generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('concurrent wrong guesses are capped at MAX_ATTEMPTS', async () => {
    const { otp } = make();
    await otp.storeOtp('a@x.com', '111111');
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => otp.verifyOtp('a@x.com', String(200000 + i))),
    );
    expect(results.filter((r) => r === 'invalid')).toHaveLength(OtpService.MAX_ATTEMPTS);
    // Even the right code is refused once locked.
    expect(await otp.verifyOtp('a@x.com', '111111')).toBe('blocked');
  });

  it('sending a new code does not reset the attempt counter', async () => {
    const { otp } = make();
    await otp.storeOtp('a@x.com', '111111');
    for (let i = 0; i < OtpService.MAX_ATTEMPTS; i++) {
      await otp.verifyOtp('a@x.com', '000000');
    }
    await otp.storeOtp('a@x.com', '222222');
    expect(await otp.verifyOtp('a@x.com', '222222')).toBe('blocked');
  });

  it('re-arms the expiry on an attempt counter that lost its TTL', async () => {
    const { otp, redis } = make();
    // INCR landed but the process died before EXPIRE: no TTL, permanent lock.
    redis.client.store.set('otp-limit:attempts:a@x.com', '3');
    await otp.verifyOtp('a@x.com', '000000');
    expect(redis.client.ttls.get('otp-limit:attempts:a@x.com')).toBe(
      OtpService.ATTEMPT_WINDOW_SECONDS,
    );
  });

  it('a correct code works once', async () => {
    const { otp } = make();
    await otp.storeOtp('a@x.com', '111111');
    const [a, b] = await Promise.all([
      otp.verifyOtp('a@x.com', '111111'),
      otp.verifyOtp('a@x.com', '111111'),
    ]);
    expect([a, b].sort()).toEqual(['invalid', 'ok']);
  });

  it('enforces a per-identifier send cooldown and daily cap', async () => {
    const { otp, redis } = make();
    await otp.assertCanSend('+911');
    await expect(otp.assertCanSend('+911')).rejects.toBeInstanceOf(HttpException);
    // Past the cooldown, the daily cap still applies.
    for (let i = 1; i < OtpService.DAILY_SEND_CAP; i++) {
      redis.client.store.delete('otp-limit:cooldown:+911:unknown');
      await otp.assertCanSend('+911');
    }
    redis.client.store.delete('otp-limit:cooldown:+911:unknown');
    await expect(otp.assertCanSend('+911')).rejects.toMatchObject({ status: 429 });
  });
});

describe('S49: OTP lockout abuse is contained per IP', () => {
  const make = () => {
    const redis = fakeRedisService();
    return { otp: new OtpService(redis as any), redis };
  };
  const ATTACKER = '6.6.6.6';
  const VICTIM = '1.2.3.4';

  it("an attacker's wrong guesses lock only the attacker's IP", async () => {
    const { otp } = make();
    await otp.storeOtp('v@x.com', '111111');
    for (let i = 0; i < 20; i++) await otp.verifyOtp('v@x.com', '000000', ATTACKER);
    expect(await otp.verifyOtp('v@x.com', '111111', ATTACKER)).toBe('blocked');
    // The victim's code survived and still works from their own IP.
    expect(await otp.verifyOtp('v@x.com', '111111', VICTIM)).toBe('ok');
  });

  it('many IPs together still hit the identifier-wide cap', async () => {
    const { otp } = make();
    await otp.storeOtp('v@x.com', '111111');
    let invalid = 0;
    for (let ip = 0; ip < 10; ip++) {
      for (let i = 0; i < OtpService.MAX_ATTEMPTS; i++) {
        if ((await otp.verifyOtp('v@x.com', '000000', `10.0.0.${ip}`)) === 'invalid') invalid++;
      }
    }
    expect(invalid).toBe(OtpService.MAX_ATTEMPTS_TOTAL);
    expect(await otp.verifyOtp('v@x.com', '111111', VICTIM)).toBe('blocked');
  });

  it('one IP spraying many identifiers hits its own cap', async () => {
    const { otp } = make();
    let invalid = 0;
    for (let i = 0; i < OtpService.IP_MAX_ATTEMPTS + 10; i++) {
      if ((await otp.verifyOtp(`u${i}@x.com`, '000000', ATTACKER)) === 'invalid') invalid++;
    }
    expect(invalid).toBe(OtpService.IP_MAX_ATTEMPTS);
  });

  it('correct codes do not use up the IP bucket (shared campus NAT)', async () => {
    const { otp } = make();
    for (let i = 0; i < OtpService.IP_MAX_ATTEMPTS + 5; i++) {
      await otp.storeOtp(`u${i}@x.com`, '111111');
      expect(await otp.verifyOtp(`u${i}@x.com`, '111111', VICTIM)).toBe('ok');
    }
  });

  it("an attacker spamming sends can't use up the victim's daily cap", async () => {
    const { otp, redis } = make();
    const send = async (ip: string) => {
      redis.client.store.delete(`otp-limit:cooldown:+911:${ip}`);
      return otp.assertCanSend('+911', ip);
    };
    for (let i = 0; i < OtpService.DAILY_SEND_CAP; i++) await send(ATTACKER);
    await expect(send(ATTACKER)).rejects.toMatchObject({ status: 429 });
    await expect(send(VICTIM)).resolves.toBeUndefined();
  });

  it('the identifier-wide send cap still bounds many IPs', async () => {
    const { otp } = make();
    for (let i = 0; i < OtpService.DAILY_SEND_CAP_TOTAL; i++) {
      await otp.assertCanSend('+911', `10.0.0.${i}`);
    }
    await expect(otp.assertCanSend('+911', '10.0.1.1')).rejects.toMatchObject({ status: 429 });
  });

  it('one IP spraying many identifiers hits the per-IP send cap', async () => {
    const { otp } = make();
    for (let i = 0; i < OtpService.IP_HOURLY_SEND_CAP; i++) {
      await otp.assertCanSend(`+91${i}`, ATTACKER);
    }
    await expect(otp.assertCanSend('+91x', ATTACKER)).rejects.toMatchObject({ status: 429 });
  });

  it('auth service passes the caller IP through', async () => {
    const { service, otp } = setup();
    await service.loginWithEmail({ email: 'a@x.com' } as any, VICTIM);
    expect(otp.assertCanSend).toHaveBeenCalledWith('a@x.com', VICTIM);
    await service.verifyEmailOtp('a@x.com', '123456', VICTIM).catch(() => undefined);
    expect(otp.verifyOtp).toHaveBeenCalledWith('a@x.com', '123456', VICTIM);
  });
});

describe('S8/S57: App Review login is off by default', () => {
  it('does not bypass OTP while the Apex toggle is off', async () => {
    const { service, otp } = setup();
    otp.verifyOtp.mockResolvedValue('invalid');
    await expect(service.verifyEmailOtp('test-user@unifesto.app', '098765')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(otp.verifyOtp).toHaveBeenCalled();
  });

  it('ignores the old env flag', async () => {
    const { service, otp } = setup({ APP_REVIEW_LOGIN_ENABLED: 'true' });
    otp.verifyOtp.mockResolvedValue('invalid');
    await expect(service.verifyEmailOtp('test-user@unifesto.app', '098765')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('bypasses only when the Apex toggle is on', async () => {
    const { service, otp, prisma } = setup();
    prisma.platformConfig.findUnique.mockResolvedValue({ appReviewLoginEnabled: true });
    otp.verifyOtp.mockResolvedValue('invalid');
    prisma.userIdentity.findUnique.mockResolvedValue({ user: user({ id: 'review' }) });
    const res = await service.verifyEmailOtp('test-user@unifesto.app', '098765');
    expect(res.user.id).toBe('review');
    expect(otp.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('J17: identifiers, OTP delivery, provider audiences', () => {
  const temp = () => sign({ type: 'temp', provider: 'GOOGLE', providerUserId: 'g-1' }, '15m');

  it('a mixed-case email signs into the same (pre-J17 mixed-case) account', async () => {
    const { service, prisma, otp } = setup();
    const owner = user({ id: 'owner' });
    // Stored before J17 as typed; the exact lowercase lookup misses it.
    prisma.userIdentity.findMany.mockImplementation(async ({ where }: any) =>
      where.provider === 'EMAIL' ? [{ providerUserId: 'Me@X.com', user: owner }] : [],
    );

    const res = await service.verifyEmailOtp('  ME@x.COM ', '123456');

    expect(otp.verifyOtp).toHaveBeenCalledWith('me@x.com', '123456', undefined);
    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unique_provider_user: { provider: 'EMAIL', providerUserId: 'me@x.com' } },
      }),
    );
    expect(res.user.id).toBe('owner');
    expect(res.accessToken).not.toBe('');
  });

  it('an ILIKE wildcard hit (`_`) is not treated as the same email', async () => {
    const { service, prisma } = setup();
    prisma.userIdentity.findMany.mockResolvedValue([
      { providerUserId: 'aXb@x.com', email: 'aXb@x.com', user: user({ id: 'victim' }) },
    ]);
    const res = await service.verifyEmailOtp('a_b@x.com', '123456');
    expect(res.accessToken).toBe('');
    expect(res.requiresMobileVerification).toBe(true);
  });

  it('send and verify use one lowercased OTP key', async () => {
    const { service, otp, email } = setup();
    await service.loginWithEmail({ email: ' Foo@Bar.com' } as any, '1.1.1.1');
    expect(otp.assertCanSend).toHaveBeenCalledWith('foo@bar.com', '1.1.1.1');
    expect(otp.storeOtp).toHaveBeenCalledWith('foo@bar.com', '123456');
    expect(email.sendOtpEmail).toHaveBeenCalledWith('foo@bar.com', '123456');
  });

  it('a failed email send is a 502, not "sent", and gives the send slot back', async () => {
    const { service, otp, email } = setup();
    email.sendOtpEmail.mockResolvedValue(false);
    await expect(service.loginWithEmail({ email: 'a@x.com' } as any, '1.1.1.1')).rejects.toMatchObject({
      status: 502,
    });
    expect(otp.releaseSend).toHaveBeenCalledWith('a@x.com', '1.1.1.1');
  });

  it('a failed WhatsApp send is a 502 and gives the send slot back', async () => {
    const { service, otp, whatsapp } = setup();
    whatsapp.sendOtp.mockResolvedValue(false);
    await expect(
      service.sendMobileOtp({ mobileNumber: '9876543210', tempToken: temp() }, '1.1.1.1'),
    ).rejects.toMatchObject({ status: 502 });
    expect(whatsapp.sendOtp).toHaveBeenCalledWith('+919876543210', '123456');
    expect(otp.releaseSend).toHaveBeenCalledWith('+919876543210', '1.1.1.1');
  });

  it('Redis down while sending still surfaces as 503', async () => {
    const { service, otp } = setup();
    otp.storeOtp.mockRejectedValue(new HttpException('down', 503));
    await expect(service.loginWithEmail({ email: 'a@x.com' } as any)).rejects.toMatchObject({ status: 503 });
  });

  it('releaseSend undoes the counters assertCanSend took', async () => {
    const redis = fakeRedisService();
    const otp = new OtpService(redis as any);
    for (let i = 0; i < OtpService.DAILY_SEND_CAP + 3; i++) {
      await otp.assertCanSend('+911', 'ip');
      await otp.releaseSend('+911', 'ip');
    }
    await expect(otp.assertCanSend('+911', 'ip')).resolves.toBeUndefined();
  });

  it('refuses a WhatsApp OTP outside the allowlist before using any cap', async () => {
    const { service, otp, whatsapp } = setup();
    await expect(
      service.sendMobileOtp({ mobileNumber: '+14155550123', tempToken: temp() }),
    ).rejects.toMatchObject({ status: 400 });
    expect(otp.assertCanSend).not.toHaveBeenCalled();
    expect(whatsapp.sendOtp).not.toHaveBeenCalled();
  });

  it('OTP_WHATSAPP_COUNTRY_CODES widens the allowlist', async () => {
    const { service, whatsapp } = setup({ OTP_WHATSAPP_COUNTRY_CODES: '91, +1' });
    await service.sendMobileOtp({ mobileNumber: '+14155550123', tempToken: temp() });
    expect(whatsapp.sendOtp).toHaveBeenCalledWith('+14155550123', '123456');
  });

  it('verify-mobile matches the account by the E.164 number', async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'owner' }));
    const res = await service.verifyMobile({ mobileNumber: '09999999999', otp: '123456', tempToken: temp() });
    expect(otp.verifyOtp).toHaveBeenCalledWith('+919999999999', '123456', undefined);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { mobileNumber: '+919999999999' } });
    expect(res.user.id).toBe('owner');
  });

  it('Apple login fails closed without APPLE_CLIENT_ID', async () => {
    const { service } = setup();
    await expect((service as any).verifyAppleToken('t')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.loginWithApple({ identityToken: 't', authorizationCode: 'c' } as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('the unused /auth/google login is gone', () => {
    const { service } = setup();
    expect((service as any).loginWithGoogle).toBeUndefined();
  });
});
