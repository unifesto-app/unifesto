/// <reference types="jest" />
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { Provider } from '@prisma/client';
import { AppleSignInService } from './apple-sign-in.service';
import { AuthService } from './auth.service';

/**
 * O17 (App Store 5.1.1(v)): the Apple sign-in code becomes a stored, encrypted
 * refresh token that account deletion revokes. Apple's endpoints are mocked.
 */

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const ENV: Record<string, string> = {
  JWT_SECRET: 'test-secret',
  APPLE_CLIENT_ID: 'app.unifesto.mobile',
  APPLE_TEAM_ID: 'TEAM123',
  APPLE_KEY_ID: 'KEY123',
  // As it sits in an .env: one line with literal \n escapes.
  APPLE_PRIVATE_KEY: (privateKey.export({ type: 'pkcs8', format: 'pem' }) as string).replace(/\n/g, '\\n'),
};
const config = (env: Record<string, string> = ENV) => ({ get: (k: string, d?: unknown) => env[k] ?? d }) as any;

let fetchMock: jest.SpyInstance;
const reply = (status: number, body: unknown) =>
  ({ ok: status < 300, status, text: async () => JSON.stringify(body) }) as Response;
const form = (call: number) => {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, params: Object.fromEntries(new URLSearchParams(init.body as URLSearchParams)) };
};

beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(reply(200, { refresh_token: 'r-apple-1' }));
});
afterEach(() => fetchMock.mockRestore());

describe('AppleSignInService', () => {
  it('exchanges the code with an ES256 client secret and returns the token encrypted', async () => {
    const apple = new AppleSignInService(config());
    const stored = await apple.exchangeCode('code-1');

    const { url, params } = form(0);
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(params).toMatchObject({ client_id: 'app.unifesto.mobile', code: 'code-1', grant_type: 'authorization_code' });
    const secret = jwt.verify(params.client_secret, publicKey, { algorithms: ['ES256'], complete: true }) as jwt.Jwt;
    expect(secret.header.kid).toBe('KEY123');
    expect(secret.payload).toMatchObject({ iss: 'TEAM123', sub: 'app.unifesto.mobile', aud: 'https://appleid.apple.com' });

    expect(stored).toBeTruthy();
    expect(stored).not.toContain('r-apple-1');
  });

  it('revoke decrypts the stored token and posts it to /auth/revoke', async () => {
    const apple = new AppleSignInService(config());
    const stored = (await apple.exchangeCode('code-1'))!;
    fetchMock.mockResolvedValue(reply(200, {}));
    await apple.revoke(stored);

    const { url, params } = form(1);
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    expect(params).toMatchObject({ client_id: 'app.unifesto.mobile', token: 'r-apple-1', token_type_hint: 'refresh_token' });
  });

  it('a failed revoke throws (so deletion can report it)', async () => {
    const apple = new AppleSignInService(config());
    const stored = (await apple.exchangeCode('code-1'))!;
    fetchMock.mockResolvedValue(reply(400, { error: 'invalid_client' }));
    await expect(apple.revoke(stored)).rejects.toThrow(/400/);
  });

  it('unconfigured: no exchange, and a stored token cannot be revoked', async () => {
    const apple = new AppleSignInService(config({ JWT_SECRET: 'test-secret' }));
    await expect(apple.exchangeCode('code-1')).resolves.toBeNull();
    await expect(apple.revoke('x')).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AuthService.loginWithApple stores the refresh token', () => {
  function setup() {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      del: jest.fn(async (k: string) => void store.delete(k)),
    };
    const prisma: any = {
      userIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      user: { create: jest.fn().mockResolvedValue({ id: 'u-new', fullName: null, username: null }) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    const email: any = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(prisma, config(), email, {} as any, {} as any, redis as any, undefined, new AppleSignInService(config()));
    jest.spyOn(service as any, 'verifyAppleToken').mockResolvedValue({ sub: 'apple-sub', email: 'a@b.in', email_verified: 'true' });
    return { service, prisma, redis, store };
  }

  it('returning Apple ID: the token goes straight onto its identity', async () => {
    const { service, prisma, redis } = setup();
    prisma.userIdentity.updateMany.mockResolvedValue({ count: 1 });
    await service.loginWithApple({ identityToken: 'id', authorizationCode: 'code-1' });

    expect(form(0).params.code).toBe('code-1');
    const { where, data } = prisma.userIdentity.updateMany.mock.calls[0][0];
    expect(where).toEqual({ provider: Provider.APPLE, providerUserId: 'apple-sub' });
    expect(data.appleRefreshToken).toEqual(expect.any(String));
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('new Apple ID: the token waits in Redis and lands when the identity is created', async () => {
    const { service, prisma, store } = setup();
    const res = await service.loginWithApple({ identityToken: 'id', authorizationCode: 'code-1' });
    expect(res.requiresMobileVerification).toBe(true);
    const parked = store.get('apple-rt:apple-sub');
    expect(parked).toEqual(expect.any(String));

    // verifyMobile's new-user branch
    await (service as any).createUser('+919999999999', Provider.APPLE, 'apple-sub', 'a@b.in', true);
    expect(prisma.userIdentity.updateMany).toHaveBeenLastCalledWith({
      where: { provider: Provider.APPLE, providerUserId: 'apple-sub' },
      data: { appleRefreshToken: parked },
    });
    expect(store.has('apple-rt:apple-sub')).toBe(false);
  });

  it('a failed exchange never blocks sign-in', async () => {
    const { service, prisma } = setup();
    fetchMock.mockResolvedValue(reply(400, { error: 'invalid_grant' }));
    await expect(service.loginWithApple({ identityToken: 'id', authorizationCode: 'used' })).resolves.toMatchObject({
      requiresMobileVerification: true,
    });
    expect(prisma.userIdentity.updateMany).not.toHaveBeenCalled();
  });
});
