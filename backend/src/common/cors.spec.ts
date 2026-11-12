import { Controller, ForbiddenException, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { corsOriginCallback, httpCorsOrigin, isAllowedOrigin } from './cors';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import * as observability from './observability';

// S26: anchored origin allowlist.
describe('isAllowedOrigin', () => {
  it.each([
    'https://unifesto.app',
    'https://apex.unifesto.app',
    'https://a.b.unifesto.app',
    'https://wegobeyond.in',
    'https://www.wegobeyond.in',
    'http://localhost',
    'http://localhost:3001',
    'http://127.0.0.1:8080',
  ])('allows %s', (o) => expect(isAllowedOrigin(o)).toBe(true));

  it.each([
    'http://apex.unifesto.app',
    'http://unifesto.app',
    'http://localhost.evil.com',
    'http://localhost:3000.evil.com',
    'https://evilunifesto.app',
    'https://unifesto.app.evil.com',
    'https://evil.com/.unifesto.app',
    'http://wegobeyond.in',
    'https://evilwegobeyond.in',
    'https://wegobeyond.in.evil.com',
    'null',
  ])('refuses %s', (o) => expect(isAllowedOrigin(o)).toBe(false));
});

describe('origin refusals are a 403, not a 500 (no Sentry issue)', () => {
  const run = (origin: string | undefined, custom: () => Promise<boolean> = async () => false) =>
    new Promise<{ err: Error | null; allow?: boolean }>((resolve) =>
      httpCorsOrigin(custom, () => undefined)(origin, (err, allow) => resolve({ err, allow })),
    );

  it('lets no-origin, allowlisted and custom-domain origins through', async () => {
    await expect(run(undefined)).resolves.toEqual({ err: null, allow: true });
    await expect(run('https://apex.unifesto.app')).resolves.toEqual({ err: null, allow: true });
    await expect(run('https://events.club.edu', async () => true)).resolves.toEqual({ err: null, allow: true });
  });

  it('refuses any other origin with a ForbiddenException', async () => {
    const { err, allow } = await run('https://example.com');
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(allow).toBe(false);
  });

  it('refuses, instead of hanging, when the custom-domain lookup fails', async () => {
    const { err } = await run('https://example.com', async () => {
      throw new Error('db down');
    });
    expect(err).toBeInstanceOf(ForbiddenException);
  });

  // engine.io answers any refusal with its own 400, so only "refused" matters there.
  it('the socket gateways still refuse other origins and let ours through', () => {
    const cb = jest.fn();
    corsOriginCallback('https://example.com', cb);
    expect(cb.mock.calls[0][0]).toBeTruthy();
    expect(cb.mock.calls[0][1]).toBe(false);
    corsOriginCallback('https://www.unifesto.app', cb);
    expect(cb.mock.calls[1]).toEqual([null, true]);
  });

  describe('through the real app setup', () => {
    const handled = jest.fn();
    @Controller()
    class Ping {
      @Get('ping')
      ping() {
        handled();
        return { ok: true };
      }
      @Post('ping')
      post() {
        handled();
        return { ok: true };
      }
    }
    let app: INestApplication;
    const report = jest.spyOn(observability, 'reportError').mockImplementation(() => undefined);

    beforeAll(async () => {
      const mod = await Test.createTestingModule({ controllers: [Ping] }).compile();
      app = mod.createNestApplication({ logger: false });
      app.enableCors({ origin: httpCorsOrigin(async () => false, () => undefined), credentials: true });
      app.useGlobalFilters(new GlobalExceptionFilter());
      await app.init();
    });
    afterAll(() => app.close());

    beforeEach(() => {
      handled.mockClear();
      report.mockClear();
    });

    it('answers a disallowed origin with our filter\'s 403 and reports nothing', async () => {
      const res = await request(app.getHttpServer()).get('/ping').set('Origin', 'https://example.com');
      expect(res.status).toBe(403);
      // Our GlobalExceptionFilter's shape (Nest's own has no path), so it really ran.
      expect(res.body).toMatchObject({ statusCode: 403, path: '/ping' });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(report).not.toHaveBeenCalled();
      expect(handled).not.toHaveBeenCalled();
    });

    it('refuses a preflight and a cookie POST from a disallowed origin before any handler', async () => {
      const pre = await request(app.getHttpServer())
        .options('/ping')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(pre.status).toBe(403);
      expect(Object.keys(pre.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
      const post = await request(app.getHttpServer()).post('/ping').set('Origin', 'https://example.com').set('Cookie', 'sid=x');
      expect(post.status).toBe(403);
      expect(handled).not.toHaveBeenCalled();
    });

    it('serves an allowed origin with its CORS header', async () => {
      const res = await request(app.getHttpServer()).get('/ping').set('Origin', 'https://www.unifesto.app');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://www.unifesto.app');
    });
  });
});
