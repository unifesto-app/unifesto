import { ConflictException, ForbiddenException, HttpException, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ApiRegisterDto } from './dto';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { PublicApiService } from './public-api.service';
import { bearerKey, generateKey, hashKey } from './api-key.util';

/** A tiny in-memory Redis: the commands these services use. */
function fakeRedis() {
  const kv = new Map<string, string>();
  const client = {
    incr: jest.fn(async (k: string) => {
      const n = Number(kv.get(k) ?? 0) + 1;
      kv.set(k, String(n));
      return n;
    }),
    expire: jest.fn(async () => 1),
    get: jest.fn(async (k: string) => kv.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && kv.has(k)) return null;
      kv.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
  };
  return { kv, client, service: { getClient: () => client } as any };
}

describe('API key format', () => {
  it('is uf_live_ + 32 random bytes, stored only as its SHA-256', () => {
    const { key, prefix, hash } = generateKey();
    expect(key).toMatch(/^uf_live_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashKey(key));
    expect(hash).toHaveLength(64);
    expect(generateKey().key).not.toBe(key);
  });

  it('reads only a Bearer uf_live_ key', () => {
    expect(bearerKey('Bearer uf_live_EXAMPLE_NOT_A_REAL_KEY')).toBe('uf_live_EXAMPLE_NOT_A_REAL_KEY');
    expect(bearerKey('uf_live_EXAMPLE_NOT_A_REAL_KEY')).toBeNull();
    expect(bearerKey('Bearer eyJhbGciOi.jwt.token')).toBeNull();
    expect(bearerKey(undefined)).toBeNull();
  });
});

describe('ApiKeyGuard', () => {
  const KEY = 'uf_live_EXAMPLE_NOT_A_REAL_KEY';
  const build = (row: Record<string, unknown> | null, spaceStatus = 'ACTIVE') => {
    const prisma: any = {
      spaceApiKey: { findUnique: jest.fn(async () => row), update: jest.fn(async () => ({})) },
      space: { findFirst: jest.fn(async () => ({ status: spaceStatus })) },
    };
    const redis = fakeRedis();
    const keys = new ApiKeysService(prisma, redis.service);
    const guard = new ApiKeyGuard(keys, prisma);
    const req: any = { headers: { authorization: `Bearer ${KEY}` }, method: 'GET' };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
    return { guard, ctx, req, prisma, redis };
  };
  const live = { id: 'k1', spaceId: 'sp-1', name: 'site', prefix: 'uf_live_EXAM', revokedAt: null, lastUsedAt: null, space: { integrationsEnabled: true } };

  it('lets a live key through and says which space it acts for', async () => {
    const { guard, ctx, req, prisma } = build(live);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.apiKey).toMatchObject({ id: 'k1', spaceId: 'sp-1' });
    expect(prisma.spaceApiKey.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { keyHash: hashKey(KEY) } }));
  });

  it('refuses anything a browser sends: the key would be public', async () => {
    const { guard, ctx, req, prisma } = build(live);
    req.headers.origin = 'https://wegobeyond.in';
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.spaceApiKey.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a missing, unknown or revoked key', async () => {
    const missing = build(live);
    missing.req.headers.authorization = undefined;
    await expect(missing.guard.canActivate(missing.ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    const unknown = build(null);
    await expect(unknown.guard.canActivate(unknown.ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    const revoked = build({ ...live, revokedAt: new Date() });
    await expect(revoked.guard.canActivate(revoked.ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses while the space has API access off, or is taken down', async () => {
    const off = build({ ...live, space: { integrationsEnabled: false } });
    await expect(off.guard.canActivate(off.ctx)).rejects.toThrow('API access is off for this space');
    const down = build(live, 'SUSPENDED');
    await expect(down.guard.canActivate(down.ctx)).rejects.toThrow('temporarily unavailable');
  });

  it('caps writes per space per minute, whichever key makes them', async () => {
    const { guard, ctx, req } = build(live);
    req.method = 'POST';
    for (let i = 0; i < 60; i++) await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});

describe('PublicApiService.register', () => {
  const key = { id: 'k1', spaceId: 'sp-1', name: 'WeGoBeyond site', prefix: 'uf_live_EXAM', integrationsEnabled: true };
  const body = { ticketTypeId: '7a1c2d3e-0000-4000-8000-000000000001', name: 'Asha', email: 'asha@example.com', ageConfirmed: true as const };
  const build = (opts: { event?: unknown; ticket?: unknown; fileQuestion?: unknown; added?: unknown } = {}) => {
    const prisma: any = {
      event: { findFirst: jest.fn(async () => (opts.event === undefined ? { id: 'ev-1', externalRegistrationUrl: null } : opts.event)) },
      eventTicketType: {
        findFirst: jest.fn(async () =>
          opts.ticket === undefined ? { id: body.ticketTypeId, kind: 'INDIVIDUAL', price: 0, saleStartsAt: null, saleEndsAt: null } : opts.ticket,
        ),
      },
      eventFormField: { findFirst: jest.fn(async () => opts.fileQuestion ?? null) },
    };
    const redis = fakeRedis();
    const registrations: any = {
      manualAddAttendee: jest.fn(async () => opts.added ?? { registrationId: 'reg-1', paymentStatus: 'PAID' }),
    };
    const svc = new PublicApiService(prisma, redis.service, registrations, new ApiKeysService(prisma, redis.service));
    return { svc, prisma, registrations, redis };
  };

  it('confirms a free ticket through manual add, tagged as the key, answers required', async () => {
    const { svc, registrations, prisma } = build();
    await expect(svc.register(key, 'build-sunday', body, 'idem-1')).resolves.toEqual({ registrationId: 'reg-1', status: 'confirmed' });
    // Only the key's own space, live and open beyond members.
    expect(prisma.event.findFirst.mock.calls[0][0].where).toMatchObject({ spaceId: 'sp-1', slug: 'build-sunday', deletedAt: null, status: 'PUBLISHED' });
    expect(registrations.manualAddAttendee).toHaveBeenCalledWith(
      'ev-1',
      // Always on: manual add uses it only when its own read of the price is above 0.
      expect.objectContaining({
        collectPayment: true,
        requireAnswers: true,
        fromApi: true,
        utm: expect.objectContaining({ utmSource: 'WeGoBeyond site', utmMedium: 'api' }),
      }),
    );
  });

  it('never comps a paid ticket: it always becomes a payment link', async () => {
    const { svc, registrations } = build({
      ticket: { id: body.ticketTypeId, kind: 'INDIVIDUAL', price: '499.00', saleStartsAt: null, saleEndsAt: null },
      added: { registrationId: 'reg-2', paymentStatus: 'PENDING', paymentLinkUrl: 'https://rzp.io/i/x', amount: 524 },
    });
    await expect(svc.register(key, 'build-sunday', body, 'idem-2')).resolves.toEqual({
      registrationId: 'reg-2',
      status: 'payment_pending',
      paymentUrl: 'https://rzp.io/i/x',
      amount: 524,
    });
    expect(registrations.manualAddAttendee.mock.calls[0][1].collectPayment).toBe(true);
  });

  it('answers a retry with the first result, and refuses the key reused for someone else', async () => {
    const { svc, registrations } = build();
    const first = await svc.register(key, 'build-sunday', body, 'idem-3');
    await expect(svc.register(key, 'build-sunday', body, 'idem-3')).resolves.toEqual(first);
    expect(registrations.manualAddAttendee).toHaveBeenCalledTimes(1);
    await expect(svc.register(key, 'build-sunday', { ...body, email: 'other@example.com' }, 'idem-3')).rejects.toThrow('different registration');
  });

  it('frees the Idempotency-Key when the registration fails, so a fixed retry can go', async () => {
    const { svc, registrations } = build();
    registrations.manualAddAttendee.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.register(key, 'build-sunday', body, 'idem-4')).rejects.toThrow('boom');
    await expect(svc.register(key, 'build-sunday', body, 'idem-4')).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('needs an Idempotency-Key', async () => {
    const { svc } = build();
    await expect(svc.register(key, 'build-sunday', body, undefined)).rejects.toThrow('Idempotency-Key');
  });

  it("can't reach another space's event, a group ticket or a required file question", async () => {
    await expect(build({ event: null }).svc.register(key, 'theirs', body, 'a')).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build({ ticket: { id: body.ticketTypeId, kind: 'GROUP', price: 0, saleStartsAt: null, saleEndsAt: null } }).svc.register(key, 'x', body, 'b'),
    ).rejects.toThrow('Group tickets');
    await expect(build({ fileQuestion: { id: 'f1' } }).svc.register(key, 'x', body, 'c')).rejects.toThrow('file upload');
    await expect(
      build({ event: { id: 'ev-1', externalRegistrationUrl: 'https://forms.gle/x' } }).svc.register(key, 'x', body, 'd'),
    ).rejects.toThrow("organiser's site");
  });
});

describe('PublicApiService.register: limits and retries', () => {
  const key = { id: 'k1', spaceId: 'sp-1', name: 'site', prefix: 'uf_live_EXAM', integrationsEnabled: true };
  const body = { ticketTypeId: '7a1c2d3e-0000-4000-8000-000000000001', name: 'Asha', email: 'Asha@Example.com', ageConfirmed: true as const };
  const setup = () => {
    const prisma: any = {
      event: { findFirst: jest.fn(async () => ({ id: 'ev-1', externalRegistrationUrl: null })) },
      eventTicketType: { findFirst: jest.fn(async () => ({ id: body.ticketTypeId, kind: 'INDIVIDUAL', saleStartsAt: null, saleEndsAt: null })) },
      eventFormField: { findFirst: jest.fn(async () => null) },
      eventRegistration: { findFirst: jest.fn(async () => ({ id: 'reg-old', paymentStatus: 'PENDING' })) },
    };
    const redis = fakeRedis();
    let n = 0;
    const registrations: any = { manualAddAttendee: jest.fn(async () => ({ registrationId: `reg-${++n}`, paymentStatus: 'PAID' })) };
    const keys = new ApiKeysService(prisma, redis.service);
    return { svc: new PublicApiService(prisma, redis.service, registrations, keys), registrations, redis };
  };

  it('counts the daily allowance per space and per email, only on success', async () => {
    const { svc, registrations, redis } = setup();
    registrations.manualAddAttendee.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.register(key, 'x', body, 'a')).rejects.toThrow('boom');
    expect([...redis.kv.keys()].filter((k) => k.includes('-day-') || k.includes('-email-'))).toEqual([]);
    for (let i = 0; i < 5; i++) await svc.register({ ...key, id: `k${i}` }, 'x', body, `b${i}`);
    // A sixth for the same address, even through another key, is refused.
    await expect(svc.register({ ...key, id: 'k9' }, 'x', body, 'c')).rejects.toThrow('this email address');
  });

  it('a person already registered gets that registration back, not an error', async () => {
    const { svc, registrations } = setup();
    registrations.manualAddAttendee.mockRejectedValueOnce(new ConflictException('already registered'));
    await expect(svc.register(key, 'x', body, 'd')).resolves.toMatchObject({ registrationId: 'reg-old', status: 'payment_pending', existing: true });
  });

  it('matches a retry by ticket and email, whatever the key order or case', async () => {
    const { svc, registrations } = setup();
    const first = await svc.register(key, 'x', body, 'e');
    const reordered = { email: 'asha@example.com', ageConfirmed: true as const, name: 'Asha', ticketTypeId: body.ticketTypeId };
    await expect(svc.register(key, 'ev-uuid-or-slug', reordered, 'e')).resolves.toEqual(first);
    expect(registrations.manualAddAttendee).toHaveBeenCalledTimes(1);
  });

  it('still answers with the registration when keeping the answer for retries fails', async () => {
    const { svc, redis } = setup();
    const set = redis.client.set;
    redis.client.set = jest.fn(async (k: string, v: string, ...rest: unknown[]) => {
      if (!rest.includes('NX')) throw new Error('redis down');
      return set(k, v, ...rest);
    }) as any;
    await expect(svc.register(key, 'x', body, 'f')).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('holds "still running" briefly and the answer for a day', async () => {
    const { svc, redis } = setup();
    await svc.register(key, 'x', body, 'g');
    expect(redis.client.set.mock.calls.map((c: unknown[]) => c[3])).toEqual([120, 86_400]);
  });
});

describe('ApiRegisterDto', () => {
  it("takes only a real true for ageConfirmed, through the app's ValidationPipe", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const meta = { type: 'body' as const, metatype: ApiRegisterDto };
    const base = { ticketTypeId: '7a1c2d3e-0000-4000-8000-000000000001', name: 'A', email: 'a@example.com' };
    await expect(pipe.transform({ ...base, ageConfirmed: true }, meta)).resolves.toBeDefined();
    for (const v of ['false', 'no', 1, 'true', undefined]) {
      await expect(pipe.transform({ ...base, ageConfirmed: v }, meta)).rejects.toBeDefined();
    }
  });
});
