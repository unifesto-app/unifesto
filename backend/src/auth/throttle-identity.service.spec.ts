import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ThrottleIdentityService } from './throttle-identity.service';
import { CognitoJwtService } from './cognito-jwt.service';

const JWT_SECRET = 'test-secret-please-ignore';
const COGNITO_ISS =
  'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_TEST123';

describe('ThrottleIdentityService', () => {
  let service: ThrottleIdentityService;
  let verifyCognitoToken: jest.Mock;

  beforeEach(async () => {
    verifyCognitoToken = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThrottleIdentityService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string) => (k === 'JWT_SECRET' ? JWT_SECRET : undefined)) },
        },
        {
          provide: CognitoJwtService,
          useValue: { verifyCognitoToken },
        },
      ],
    }).compile();

    service = module.get(ThrottleIdentityService);
  });

  it('returns null when no token is present', async () => {
    await expect(service.resolveUserId(undefined)).resolves.toBeNull();
    await expect(service.resolveUserId('')).resolves.toBeNull();
  });

  it('returns the userId from a valid custom JWT', async () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
    await expect(service.resolveUserId(token)).resolves.toBe('user-123');
  });

  it('returns null for a token signed with the wrong secret (forged)', async () => {
    const token = jwt.sign({ userId: 'attacker' }, 'wrong-secret', { expiresIn: '1h' });
    await expect(service.resolveUserId(token)).resolves.toBeNull();
  });

  it('returns null for an expired custom JWT', async () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: -10 });
    await expect(service.resolveUserId(token)).resolves.toBeNull();
  });

  it('ignores refresh tokens (they are not an API identity)', async () => {
    const token = jwt.sign({ userId: 'user-123', type: 'refresh' }, JWT_SECRET, {
      expiresIn: '1h',
    });
    await expect(service.resolveUserId(token)).resolves.toBeNull();
  });

  it('returns null for a malformed / non-JWT string', async () => {
    await expect(service.resolveUserId('not-a-jwt')).resolves.toBeNull();
    await expect(service.resolveUserId('a.b.c')).resolves.toBeNull();
  });

  it('routes Cognito tokens to CognitoJwtService and returns sub', async () => {
    verifyCognitoToken.mockResolvedValue({ sub: 'cognito-user-9' });
    // Detection only decodes claims, so the signing secret is irrelevant here.
    const token = jwt.sign(
      { sub: 'cognito-user-9', iss: COGNITO_ISS, token_use: 'access' },
      'irrelevant',
    );

    await expect(service.resolveUserId(token)).resolves.toBe('cognito-user-9');
    expect(verifyCognitoToken).toHaveBeenCalledTimes(1);
  });

  it('returns null when Cognito verification throws (forged/expired)', async () => {
    verifyCognitoToken.mockRejectedValue(new Error('invalid'));
    const token = jwt.sign(
      { sub: 'x', iss: COGNITO_ISS, token_use: 'access' },
      'irrelevant',
    );
    await expect(service.resolveUserId(token)).resolves.toBeNull();
  });

  it('caches a verified result and does not re-verify the same token', async () => {
    verifyCognitoToken.mockResolvedValue({ sub: 'cognito-user-9' });
    const token = jwt.sign(
      { sub: 'cognito-user-9', iss: COGNITO_ISS, token_use: 'access' },
      'irrelevant',
    );

    await service.resolveUserId(token);
    await service.resolveUserId(token);

    // Second call served from the in-memory cache.
    expect(verifyCognitoToken).toHaveBeenCalledTimes(1);
  });
});
