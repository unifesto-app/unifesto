/// <reference types="jest" />
import { createHash, generateKeyPairSync, randomBytes, sign as signData, type KeyObject } from 'crypto';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { PasskeyService } from './passkey.service';

/**
 * Passkeys end to end against the real verifier: a software authenticator
 * (P-256 keys, `none` attestation) answers the options the service issues.
 */

const SECRET = 'test-secret';
const RP_ID = 'unifesto.app';
const ORIGIN = 'https://www.unifesto.app';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
const b64url = (b: Uint8Array | string) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

/** A passkey on a device: its key pair, credential id and the account it was made for. */
class Authenticator {
  readonly key = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  readonly id = randomBytes(16);
  counter = 0;
  userHandle = '';

  private authData(flags: number, attested?: Buffer) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    return Buffer.concat([sha256(RP_ID), Buffer.from([flags]), count, attested ?? Buffer.alloc(0)]);
  }

  private clientData(type: string, challenge: string, origin: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** navigator.credentials.create(), as JSON. */
  create(options: { challenge: string; user: { id: string } }, origin = ORIGIN) {
    this.userHandle = options.user.id;
    const jwk = this.key.publicKey.export({ format: 'jwk' });
    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.id.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLen, this.id, Buffer.from(cose)]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', this.authData(0x45, attested)], // UP | UV | AT
      ]) as any,
    );
    return {
      id: b64url(this.id),
      rawId: b64url(this.id),
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge, origin)),
        attestationObject: b64url(attestationObject),
        transports: ['internal'] as any,
      },
      clientExtensionResults: {},
    };
  }

  /** navigator.credentials.get(), as JSON. */
  get(options: { challenge: string }, signer: KeyObject = this.key.privateKey) {
    this.counter++;
    const authData = this.authData(0x05); // UP | UV
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, ORIGIN);
    return {
      id: b64url(this.id),
      rawId: b64url(this.id),
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signData('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), signer)),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
    };
  }
}

const userRow = (id: string, over: Record<string, any> = {}) => ({
  id,
  mobileNumber: '+919999999999',
  mobileVerified: true,
  username: null,
  fullName: 'Asha',
  avatarUrl: null,
  bio: null,
  gender: null,
  linkedinUrl: null,
  instagramUrl: null,
  githubUrl: null,
  websiteUrl: null,
  createdAt: new Date(),
  deletionRequestedAt: null,
  ageConfirmedAt: null,
  deletedAt: null,
  suspendedAt: null,
  suspendedUntil: null,
  tokenVersion: 0,
  ...over,
});

function setup() {
  const users = new Map([
    ['user-a', userRow('user-a')],
    ['user-b', userRow('user-b', { fullName: 'Ben' })],
  ]);
  const passkeys = new Map<string, any>();
  const sessions: { userId: string; userAgent: string | null }[] = [];
  let n = 0;
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        const u = users.get(where.id);
        if (!u) return null;
        return {
          ...u,
          identities: [{ email: `${u.id}@example.com`, isPrimary: true }],
          passkeys: [...passkeys.values()].filter((p) => p.userId === u.id),
        };
      }),
    },
    passkey: {
      findMany: jest.fn(async ({ where }: any) => [...passkeys.values()].filter((p) => p.userId === where.userId)),
      findUnique: jest.fn(async ({ where }: any) => {
        const p = [...passkeys.values()].find((x) => x.credentialId === where.credentialId);
        return p ? { ...p, user: users.get(p.userId) } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        if ([...passkeys.values()].some((p) => p.credentialId === data.credentialId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        const row = { id: `pk-${++n}`, createdAt: new Date(), lastUsedAt: null, ...data, counter: BigInt(data.counter) };
        passkeys.set(row.id, row);
        return { id: row.id, name: row.name, createdAt: row.createdAt, lastUsedAt: null };
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(passkeys.get(where.id), data)),
      deleteMany: jest.fn(async ({ where }: any) => {
        const p = passkeys.get(where.id);
        if (!p || p.userId !== where.userId) return { count: 0 };
        passkeys.delete(where.id);
        return { count: 1 };
      }),
    },
    authSession: {
      create: jest.fn(async ({ data }: any) => {
        sessions.push(data);
        return { id: `sess-${sessions.length}` };
      }),
    },
    userIdentity: { findMany: jest.fn(async () => [{ email: 'a@example.com' }]) },
    userRole: { findMany: jest.fn(async () => []) },
  };
  const store = new Map<string, string>();
  const redis: any = {
    set: async (k: string, v: string) => void store.set(k, v),
    take: async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    },
  };
  const config: any = { get: (k: string, d?: any) => ({ JWT_SECRET: SECRET })[k] ?? d };
  const email: any = { sendSignInMethodAdded: jest.fn(async () => undefined) };
  const auth = new AuthService(prisma, config, email, {} as any, {} as any, redis, undefined, undefined, undefined);
  const service = new PasskeyService(prisma, redis, auth, config);

  /** Signed in as `userId`, add a passkey from this browser. */
  const add = async (userId: string, device = new Authenticator()) => {
    const options = await service.registrationOptions(userId);
    await service.register(userId, device.create(options) as any, UA);
    return device;
  };
  return { service, prisma, users, passkeys, sessions, email, add };
}

describe('passkeys: adding one', () => {
  it('saves the credential under my account, named for this browser, and emails me', async () => {
    const { service, passkeys, email, add } = setup();
    const device = await add('user-a');
    const [row] = [...passkeys.values()];
    expect(row).toMatchObject({ userId: 'user-a', credentialId: b64url(device.id), name: 'Chrome on macOS' });
    expect(await service.list('user-a')).toHaveLength(1);
    await new Promise((r) => setImmediate(r));
    expect(email.sendSignInMethodAdded).toHaveBeenCalledWith('a@example.com', 'A passkey');
  });

  it('asks for a discoverable passkey and leaves out the ones I already have', async () => {
    const { service, add } = setup();
    const device = await add('user-a');
    const options = await service.registrationOptions('user-a');
    expect(options.rp.id).toBe(RP_ID);
    expect(options.authenticatorSelection?.residentKey).toBe('required');
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual([b64url(device.id)]);
    expect(Buffer.from(options.user.id, 'base64url').toString()).toBe('user-a');
  });

  it('refuses a replayed registration: each challenge is good once', async () => {
    const { service, passkeys } = setup();
    const options = await service.registrationOptions('user-a');
    const answer = new Authenticator().create(options);
    await service.register('user-a', answer as any, UA);
    await expect(service.register('user-a', answer as any, UA)).rejects.toThrow("Couldn't add that passkey");
    expect(passkeys.size).toBe(1);
  });

  it("refuses a challenge issued to another account (wrong user)", async () => {
    const { service, passkeys } = setup();
    const options = await service.registrationOptions('user-a');
    const answer = new Authenticator().create(options);
    await expect(service.register('user-b', answer as any, UA)).rejects.toThrow("Couldn't add that passkey");
    // Spent by the failed try, so user A can't finish with it either.
    await expect(service.register('user-a', answer as any, UA)).rejects.toThrow("Couldn't add that passkey");
    expect(passkeys.size).toBe(0);
  });

  it('refuses a sign-in challenge, another origin, or a challenge it never issued', async () => {
    const { service } = setup();
    const signIn = await service.signInOptions();
    const asReg = new Authenticator().create({ challenge: signIn.challenge, user: { id: b64url('user-a') } });
    await expect(service.register('user-a', asReg as any, UA)).rejects.toThrow("Couldn't add that passkey");

    const options = await service.registrationOptions('user-a');
    const phished = new Authenticator().create(options, 'https://unifesto-login.example');
    await expect(service.register('user-a', phished as any, UA)).rejects.toThrow("Couldn't add that passkey");

    const made = new Authenticator().create({ challenge: b64url('made-up'), user: { id: b64url('user-a') } });
    await expect(service.register('user-a', made as any, UA)).rejects.toThrow("Couldn't add that passkey");
  });

  it('a passkey already on an account is a 409', async () => {
    const { service, add } = setup();
    const device = await add('user-a');
    const options = await service.registrationOptions('user-b');
    await expect(service.register('user-b', device.create(options) as any, UA)).rejects.toThrow('already added');
  });
});

describe('passkeys: signing in', () => {
  it('ends in a linked-device session for the passkey owner, like every other sign-in', async () => {
    const { service, passkeys, sessions, add } = setup();
    const device = await add('user-a');
    const startSession = jest.spyOn(AuthService.prototype, 'startSession');

    const res = await service.signIn(device.get(await service.signInOptions()) as any, UA);

    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }), UA);
    expect(sessions).toEqual([{ userId: 'user-a', userAgent: UA }]);
    expect(jwt.verify(res.accessToken, SECRET)).toMatchObject({ userId: 'user-a', type: 'access', sid: 'sess-1' });
    expect(jwt.verify(res.refreshToken!, SECRET)).toMatchObject({ userId: 'user-a', type: 'refresh' });
    expect(res.user.id).toBe('user-a');
    const [row] = [...passkeys.values()];
    expect(row.counter).toBe(1);
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    startSession.mockRestore();
  });

  it('refuses a replayed sign-in: the challenge is spent', async () => {
    const { service, sessions, add } = setup();
    const device = await add('user-a');
    const answer = device.get(await service.signInOptions());
    await service.signIn(answer as any, UA);
    await expect(service.signIn(answer as any, UA)).rejects.toThrow(UnauthorizedException);
    expect(sessions).toHaveLength(1);
  });

  it('refuses a registration challenge used to sign in', async () => {
    const { service, add } = setup();
    const device = await add('user-a');
    const reg = await service.registrationOptions('user-a');
    await expect(service.signIn(device.get(reg) as any, UA)).rejects.toThrow(UnauthorizedException);
  });

  it("refuses a passkey that claims to be someone else's (wrong user)", async () => {
    const { service, sessions, add } = setup();
    const device = await add('user-a');
    device.userHandle = b64url('user-b');
    await expect(service.signIn(device.get(await service.signInOptions()) as any, UA)).rejects.toThrow(
      "isn't on a Unifesto account",
    );
    expect(sessions).toHaveLength(0);
  });

  it("refuses a signature from a key that isn't the saved one", async () => {
    const { service, sessions, add } = setup();
    const device = await add('user-a');
    const forged = device.get(await service.signInOptions(), new Authenticator().key.privateKey);
    await expect(service.signIn(forged as any, UA)).rejects.toThrow("didn't work");
    expect(sessions).toHaveLength(0);
  });

  it('refuses an unknown passkey and a deleted account', async () => {
    const { service, users, add } = setup();
    const stranger = new Authenticator();
    stranger.userHandle = b64url('user-a');
    await expect(service.signIn(stranger.get(await service.signInOptions()) as any, UA)).rejects.toThrow(
      "isn't on a Unifesto account",
    );
    const device = await add('user-a');
    users.get('user-a')!.deletedAt = new Date() as any;
    await expect(service.signIn(device.get(await service.signInOptions()) as any, UA)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('a suspended account gets no session', async () => {
    const { service, users, sessions, add } = setup();
    const device = await add('user-a');
    users.get('user-a')!.suspendedAt = new Date() as any;
    await expect(service.signIn(device.get(await service.signInOptions()) as any, UA)).rejects.toThrow(
      ForbiddenException,
    );
    expect(sessions).toHaveLength(0);
  });
});

describe('passkeys: removing one', () => {
  it("removes mine, and can't touch someone else's (wrong user)", async () => {
    const { service, passkeys, add } = setup();
    await add('user-a');
    const [row] = [...passkeys.values()];
    await expect(service.remove('user-b', row.id)).rejects.toThrow(NotFoundException);
    expect(passkeys.size).toBe(1);
    await expect(service.remove('user-a', row.id)).resolves.toEqual({ removed: true });
    expect(passkeys.size).toBe(0);
  });

  it("a removed passkey can't sign in", async () => {
    const { service, passkeys, add } = setup();
    const device = await add('user-a');
    await service.remove('user-a', [...passkeys.values()][0].id);
    await expect(service.signIn(device.get(await service.signInOptions()) as any, UA)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
