import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';
import { describeDevice } from './device-label';
import { AuthResponseDto, UserProfileDto } from './dto';

/** A ceremony's challenge: good for five minutes and one try. */
const CHALLENGE_TTL_SEC = 300;
const challengeKey = (challenge: string) => `auth:passkey:${challenge}`;
const SIGN_IN = 'sign-in';

/**
 * Android's Credential Manager signs for the app as
 * `android:apk-key-hash:<sha256 of its signing cert>`, the fingerprint in
 * websites/web/public/.well-known/assetlinks.json. iOS signs as the web origin.
 */
const ORIGINS = [
  'https://unifesto.app',
  'https://www.unifesto.app',
  'android:apk-key-hash:Mb0XcjA-YQspEgdXI_-WQVpcegypS6vrl-lepYY_7uE',
];

const UNKNOWN_PASSKEY = "That passkey isn't on a Unifesto account. Sign in another way, then add it in Security.";

/** What my passkey list shows. */
const LISTED = { id: true, name: true, createdAt: true, lastUsedAt: true } as const;

/**
 * Passkeys (WebAuthn): I add one while signed in, then sign in with it on the
 * web or in the app. Relying party `unifesto.app`, so one passkey works on
 * www, the bare domain, and the app (its AASA and assetlinks list both).
 */
@Injectable()
export class PasskeyService {
  private readonly logger = new Logger(PasskeyService.name);
  private readonly rpID: string;
  private readonly origins: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    // Overridable for local development only (localhost can't claim unifesto.app).
    this.rpID = config.get<string>('WEBAUTHN_RP_ID') || 'unifesto.app';
    this.origins = config.get<string>('WEBAUTHN_ORIGINS')?.split(',').map((o) => o.trim()).filter(Boolean) || ORIGINS;
  }

  /**
   * The challenge check: true only for the first caller presenting a challenge
   * this server issued for `purpose`. Taking it deletes it, so a replayed
   * response, or one for another account or ceremony, is refused.
   */
  private spend = (purpose: string) => async (challenge: string) =>
    (await this.redis.take(challengeKey(challenge))) === purpose;

  list(userId: string) {
    return this.prisma.passkey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: LISTED });
  }

  /** Adding a passkey, step 1: what my device is asked to create. */
  async registrationOptions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        username: true,
        mobileNumber: true,
        identities: { where: { email: { not: null } }, select: { email: true, isPrimary: true } },
        passkeys: { select: { credentialId: true, transports: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    // What the passkey picker shows: my main email, else my username or number.
    const email = (user.identities.find((i) => i.isPrimary) ?? user.identities[0])?.email;
    const userName = email || user.username || user.mobileNumber;
    const options = await generateRegistrationOptions({
      rpName: 'Unifesto',
      rpID: this.rpID,
      userID: new TextEncoder().encode(userId),
      userName,
      userDisplayName: user.fullName || userName,
      // A device that already holds one of mine doesn't make a second.
      excludeCredentials: user.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
      // Discoverable, so signing in needs no email first.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await this.redis.set(challengeKey(options.challenge), `register:${userId}`, CHALLENGE_TTL_SEC);
    return options;
  }

  /** Adding a passkey, step 2: my device's answer, checked and saved. */
  async register(userId: string, response: RegistrationResponseJSON, userAgent?: string) {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: this.spend(`register:${userId}`),
      expectedOrigin: this.origins,
      expectedRPID: this.rpID,
    }).catch((err) => {
      this.logger.warn(`passkey registration refused: ${(err as Error)?.message ?? err}`);
      return null;
    });
    if (!result?.verified) throw new BadRequestException("Couldn't add that passkey. Try again.");

    const { credential } = result.registrationInfo;
    try {
      const passkey = await this.prisma.passkey.create({
        data: {
          userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports ?? [],
          name: describeDevice(userAgent ?? null).name,
        },
        select: LISTED,
      });
      this.auth
        .notifySignInMethodAdded(userId, 'PASSKEY')
        .catch((err) => this.logger.error(`passkey notice failed for ${userId}`, err));
      return passkey;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That passkey is already added.');
      }
      throw err;
    }
  }

  async remove(userId: string, id: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.passkey.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('That passkey is already removed');
    return { removed: true };
  }

  /** Signing in, step 1 (public): any of my passkeys can answer. */
  async signInOptions() {
    const options = await generateAuthenticationOptions({ rpID: this.rpID, userVerification: 'required' });
    await this.redis.set(challengeKey(options.challenge), SIGN_IN, CHALLENGE_TTL_SEC);
    return options;
  }

  /** Signing in, step 2: the passkey's signature, then a session like every other sign-in. */
  async signIn(response: AuthenticationResponseJSON, userAgent?: string): Promise<AuthResponseDto> {
    const passkey =
      typeof response?.id === 'string' && response.id
        ? await this.prisma.passkey.findUnique({ where: { credentialId: response.id }, include: { user: true } })
        : null;
    if (!passkey || passkey.user.deletedAt) throw new UnauthorizedException(UNKNOWN_PASSKEY);
    // The account the device says the passkey is for must be its owner.
    const handle = response.response?.userHandle;
    if (handle && Buffer.from(handle, 'base64url').toString() !== passkey.userId) {
      throw new UnauthorizedException(UNKNOWN_PASSKEY);
    }

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: this.spend(SIGN_IN),
      expectedOrigin: this.origins,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
    }).catch((err) => {
      this.logger.warn(`passkey sign-in refused: ${(err as Error)?.message ?? err}`);
      return null;
    });
    if (!result?.verified) throw new UnauthorizedException("That passkey didn't work. Try again.");

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
    const roles = await this.prisma.userRole.findMany({
      where: { userId: passkey.userId },
      include: { role: { select: { code: true, name: true } } },
    });
    return {
      ...(await this.auth.startSession(passkey.user, userAgent)),
      user: UserProfileDto.fromUser(passkey.user, roles),
      requiresMobileVerification: false,
    };
  }
}
