import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import * as jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import jwksClient from 'jwks-rsa';
import { Prisma, Provider, User } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OtpService, OtpVerifyResult } from './otp.service';
import { CognitoJwtService } from './cognito-jwt.service';
import {
  GoogleLoginDto,
  AppleLoginDto,
  EmailLoginDto,
  SendMobileOtpDto,
  VerifyMobileDto,
  AuthResponseDto,
  UserProfileDto,
} from './dto';

/**
 * S48: what verifyMobile reads before deleting the account a login came from.
 * Every User relation is counted (from the Prisma schema, so new relations are
 * covered automatically); the placeholder must have none of them.
 */
const USER_RELATIONS = Prisma.dmmf.datamodel.models
  .find((m) => m.name === 'User')!
  .fields.filter((f) => f.kind === 'object');
const PLACEHOLDER_PROBE = {
  mobileNumber: true,
  mobileVerified: true,
  fullName: true,
  identities: { select: { provider: true } },
  _count: {
    select: Object.fromEntries(
      USER_RELATIONS.filter((f) => f.isList && f.name !== 'identities').map((f) => [f.name, true]),
    ),
  },
  ...Object.fromEntries(
    USER_RELATIONS.filter((f) => !f.isList).map((f) => [f.name, { select: { id: true } }]),
  ),
} as const;

/**
 * The account loginWithCognito mints for a new Google/Apple sign-in: synthetic
 * `+0` mobile, never verified, no name, its only identity is this Google/Apple
 * login, and nothing else points at it. Manual-add and judge placeholders also
 * use `+0` but carry an EMAIL identity, so they never qualify.
 */
function isEmptyCognitoPlaceholder(u: any, provider: Provider): boolean {
  if (!u || u.mobileVerified || u.fullName || !u.mobileNumber?.startsWith('+0')) return false;
  if (provider !== Provider.GOOGLE && provider !== Provider.APPLE) return false;
  if (u.identities.length !== 1 || u.identities[0].provider !== provider) return false;
  if (Object.values(u._count).some((n) => n !== 0)) return false;
  return USER_RELATIONS.filter((f) => !f.isList).every((f) => u[f.name] == null);
}

/** Mobile-verification temp token (`type: 'temp'`). */
interface TempTokenPayload {
  type: 'temp';
  provider: Provider;
  providerUserId: string;
  email?: string;
  emailVerified?: boolean;
}

/** Access and refresh token claims. `type`/`tv`/`jti` are absent on tokens issued before S6. */
interface SessionTokenPayload {
  userId?: unknown;
  type?: unknown;
  tv?: unknown;
  jti?: unknown;
  exp?: number;
}

type TokenUser = { id: string; tokenVersion: number };

/** IdPs send `email_verified` as a boolean or the string "true". */
const isVerified = (v: unknown): boolean => v === true || v === 'true';

/**
 * A rotated refresh token still works for this long (a client retrying a
 * rotate whose response was lost). After that, and after logout, it is refused.
 * ponytail: no reuse-triggered revoke-all (flaky networks would log people
 * out); add it if refresh-token theft shows up in the logs.
 */
const REFRESH_REUSE_GRACE_MS = 60 * 1000;

/** App Store review login bypass; off unless this env var is exactly "true". */
export const APP_REVIEW_LOGIN_ENV = 'APP_REVIEW_LOGIN_ENABLED';
const APP_REVIEW_EMAIL = 'test-user@unifesto.app';
const APP_REVIEW_OTP = '098765';

interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

interface AppleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

/** Minimum gap between `users.last_seen_at` writes for one user. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * AuthService handles multi-provider authentication for Unifesto.
 *
 * AUTHENTICATION FLOW PRESERVATION:
 * This service maintains all existing authentication flows:
 * - Google OAuth login
 * - Apple Sign-In
 * - Email OTP login
 * - Mobile OTP verification
 *
 * CUSTOM JWT TOKEN SYSTEM:
 * All authentication flows continue to use custom JWT tokens (signed with JWT_SECRET)
 * for session management after initial authentication. This is NOT replaced by Cognito tokens.
 *
 * COGNITO INTEGRATION:
 * CognitoJwtService is optionally injected for future Cognito-based authentication flows.
 * It is NOT currently used in the existing Google/Apple/Email/Mobile authentication flows.
 *
 * MOBILE VERIFICATION WORKFLOW:
 * The temp token system for mobile verification remains unchanged:
 * 1. User authenticates via Google/Apple/Email
 * 2. If mobile not verified, receive temp token
 * 3. Verify mobile via OTP
 * 4. Receive permanent access token
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;
  private readonly appleJwksClient: jwksClient.JwksClient;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly otpService: OtpService,
    private readonly redis: RedisService,
    private readonly cognitoJwtService?: CognitoJwtService, // Optional injection for future Cognito flows
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    // Refresh token lives well beyond the access token so the app can silently
    // renew the session instead of logging the user out.
    this.refreshExpiresIn = this.configService.get<string>(
      'REFRESH_EXPIRES_IN',
      '180d',
    );

    // Initialize Google OAuth client
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(googleClientId);

    // Initialize Apple JWKS client
    this.appleJwksClient = jwksClient({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });

    this.logger.log('AuthService initialized - all existing auth flows preserved');
  }

  // =====================================================
  // GOOGLE LOGIN
  // =====================================================
  async loginWithGoogle(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    try {
      // Verify Google ID token
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload() as GoogleTokenPayload;
      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }

      return await this.handleProviderLogin(
        Provider.GOOGLE,
        payload.sub,
        payload.email,
        payload.email_verified,
        payload.name,
      );
    } catch (error) {
      this.logger.error('Google login failed', error);
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  // =====================================================
  // APPLE LOGIN
  // =====================================================
  async loginWithApple(dto: AppleLoginDto): Promise<AuthResponseDto> {
    try {
      // Verify Apple identity token
      const decoded = await this.verifyAppleToken(dto.identityToken);

      return await this.handleProviderLogin(
        Provider.APPLE,
        decoded.sub,
        decoded.email,
        isVerified(decoded.email_verified),
      );
    } catch (error) {
      this.logger.error('Apple login failed', error);
      throw new UnauthorizedException('Apple authentication failed');
    }
  }

  private async verifyAppleToken(token: string): Promise<AppleTokenPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          this.appleJwksClient.getSigningKey(header.kid!, (err, key) => {
            if (err) {
              callback(err);
            } else {
              const signingKey = key?.getPublicKey();
              callback(null, signingKey);
            }
          });
        },
        {
          audience: this.configService.get<string>('APPLE_CLIENT_ID'),
          issuer: 'https://appleid.apple.com',
        },
        (err, decoded) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded as AppleTokenPayload);
          }
        },
      );
    });
  }

  // =====================================================
  // EMAIL LOGIN
  // =====================================================
  async loginWithEmail(dto: EmailLoginDto, ip?: string): Promise<{ message: string }> {
    await this.otpService.assertCanSend(dto.email, ip);
    try {
      // Generate OTP
      const otp = this.otpService.generateOtp();

      // Store OTP
      await this.otpService.storeOtp(dto.email, otp);

      // Send OTP via Resend
      await this.emailService.sendOtpEmail(dto.email, otp);

      return {
        message: 'OTP sent to email. Use the OTP to complete authentication.',
      };
    } catch (error) {
      this.logger.error('Email OTP send failed', error);
      throw new BadRequestException('Failed to send email OTP');
    }
  }

  async verifyEmailOtp(email: string, otp: string, ip?: string): Promise<AuthResponseDto> {
    try {
      // Apple App Review bypass: static test account, only while the env flag
      // is on (turn it on for a review, off afterwards).
      if (
        this.configService.get<string>(APP_REVIEW_LOGIN_ENV) === 'true' &&
        email === APP_REVIEW_EMAIL &&
        otp === APP_REVIEW_OTP
      ) {
        return await this.handleProviderLogin(
          Provider.EMAIL,
          email,
          email,
          true,
        );
      }

      this.assertOtpOk(await this.otpService.verifyOtp(email, otp, ip));

      this.logger.log(`Handling provider login for email: ${email}`);

      return await this.handleProviderLogin(
        Provider.EMAIL,
        email, // Use email as provider user ID for email auth
        email,
        true,
      );
    } catch (error) {
      this.logger.error('Email OTP verification failed', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid OTP');
    }
  }

  // =====================================================
  // MOBILE VERIFICATION
  // =====================================================
  async sendMobileOtp(dto: SendMobileOtpDto, ip?: string): Promise<{ message: string }> {
    try {
      this.verifyTempToken(dto.tempToken);
      await this.otpService.assertCanSend(dto.mobileNumber, ip);

      // Generate OTP
      const otp = this.otpService.generateOtp();

      // Store OTP
      await this.otpService.storeOtp(dto.mobileNumber, otp);

      // Send OTP via WhatsApp
      await this.whatsappService.sendOtp(dto.mobileNumber, otp);

      return {
        message: 'OTP sent to your WhatsApp',
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) throw error;
      this.logger.error('Mobile OTP send failed', error);
      throw new BadRequestException('Failed to send mobile OTP');
    }
  }

  async verifyMobile(dto: VerifyMobileDto, ip?: string): Promise<AuthResponseDto> {
    try {
      // Verify temp token
      const decoded = this.verifyTempToken(dto.tempToken);

      this.assertOtpOk(
        await this.otpService.verifyOtp(dto.mobileNumber, dto.otp, ip),
      );

      // verifyTempToken guarantees provider + providerUserId are non-empty, and
      // the unique-key lookups below make Prisma throw rather than drop an
      // undefined filter (S4: an empty filter matched every identity).
      const identityKey = {
        unique_provider_user: {
          provider: decoded.provider,
          providerUserId: decoded.providerUserId,
        },
      };

      // Check if a Cognito user already exists with this provider identity (placeholder mobile)
      const cognitoUser = await this.prisma.userIdentity.findUnique({
        where: identityKey,
        include: { user: true },
      });

      if (cognitoUser && !cognitoUser.user.mobileVerified) {
        // Check if mobile number already belongs to another user
        const existingMobileUser = await this.prisma.user.findUnique({
          where: { mobileNumber: dto.mobileNumber },
        });

        if (existingMobileUser && existingMobileUser.id !== cognitoUser.user.id) {
          // Mobile belongs to another account: move this login onto it, but
          // only delete the account we came from if it's an empty Cognito
          // placeholder (S48). Anything else may be a real account (manual
          // add, judge invite, email-OTP user) and must never cascade-delete.
          await this.prisma.$transaction(async (tx) => {
            const from = await tx.user.findUnique({
              where: { id: cognitoUser.user.id },
              select: PLACEHOLDER_PROBE,
            });
            // Hackathon tables hold a user id with no Prisma relation, so the
            // probe can't see them; an email invite can attach to a placeholder.
            const id = cognitoUser.user.id;
            const unlinkedRefs = await Promise.all([
              tx.leaderboardEntrant.count({ where: { userId: id } }),
              tx.leaderboardPanelist.count({ where: { userId: id } }),
              tx.leaderboardScore.count({ where: { judgeUserId: id } }),
              tx.leaderboardJudgment.count({ where: { panelistUserId: id } }),
              tx.hackathonJudgeProfile.count({ where: { userId: id } }),
              tx.hackathonPanelMember.count({ where: { userId: id } }),
              tx.hackathonEvalRequest.count({ where: { judgeUserId: id } }),
            ]);
            if (
              !isEmptyCognitoPlaceholder(from, decoded.provider) ||
              unlinkedRefs.some((n) => n > 0)
            ) {
              throw new ConflictException(
                'This mobile number belongs to another Unifesto account. Sign in to that account instead, or use a different number.',
              );
            }
            await tx.userIdentity.update({
              where: identityKey,
              data: { userId: existingMobileUser.id },
            });
            await tx.user.delete({ where: { id: cognitoUser.user.id } });
          });
          const userRoles = await this.prisma.userRole.findMany({
            where: { userId: existingMobileUser.id },
            include: { role: { select: { code: true, name: true } } },
          });
          return {
            ...this.tokensFor(existingMobileUser),
            user: UserProfileDto.fromUser(existingMobileUser, userRoles),
            requiresMobileVerification: false,
            isNewUser: false,
          };
        }

        // Update the existing Cognito user with real mobile number
        const updatedUser = await this.prisma.user.update({
          where: { id: cognitoUser.user.id },
          data: {
            mobileNumber: dto.mobileNumber,
            mobileVerified: true,
          },
        });
        return {
          ...this.tokensFor(updatedUser),
          user: UserProfileDto.fromUser(updatedUser),
          requiresMobileVerification: false,
        };
      }

      // Check if mobile number already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { mobileNumber: dto.mobileNumber },
      });

      if (existingUser) {
        // Link identity to existing user
        await this.linkIdentityToUser(
          existingUser.id,
          decoded.provider,
          decoded.providerUserId,
          decoded.email,
          decoded.emailVerified === true,
        );

        return {
          ...this.tokensFor(existingUser),
          user: UserProfileDto.fromUser(existingUser),
          requiresMobileVerification: false,
          isNewUser: false,
        };
      } else {
        // Create new user
        const newUser = await this.createUser(
          dto.mobileNumber,
          decoded.provider,
          decoded.providerUserId,
          decoded.email,
          decoded.emailVerified === true,
        );

        return {
          ...this.tokensFor(newUser),
          user: UserProfileDto.fromUser(newUser),
          requiresMobileVerification: false,
          isNewUser: true,
        };
      }
    } catch (error) {
      this.logger.error('Mobile verification failed', error);
      if (error instanceof UnauthorizedException || error instanceof ConflictException) {
        throw error;
      }
      throw new UnauthorizedException('Mobile verification failed');
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================
  private async handleProviderLogin(
    provider: Provider,
    providerUserId: string,
    email?: string,
    emailVerified?: boolean,
    fullName?: string,
  ): Promise<AuthResponseDto> {
    // Check if identity already exists
    const existingIdentity = await this.prisma.userIdentity.findUnique({
      where: {
        unique_provider_user: {
          provider,
          providerUserId,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingIdentity) {
      // User exists, check if mobile is verified
      const user = existingIdentity.user;

      if (!user.mobileVerified) {
        // Generate temp token for mobile verification
        const tempToken = this.generateTempToken(provider, providerUserId, email, emailVerified);

        return {
          accessToken: '',
          user: UserProfileDto.fromUser(user),
          requiresMobileVerification: true,
          tempToken,
        };
      }

      // Fetch user roles
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId: user.id },
        include: { role: { select: { code: true, name: true } } },
      });
      return {
        ...this.tokensFor(user),
        user: UserProfileDto.fromUser(user, userRoles),
        requiresMobileVerification: false,
      };
    }

    // No exact identity match: link to an existing account by email, but only
    // when the IdP vouches for the email AND the existing identity's email was
    // verified (S5). Otherwise fall through to the new-user path: mobile OTP,
    // which links to the existing account only if they prove its mobile.
    if (email && emailVerified) {
      const existingByEmail = await this.prisma.userIdentity.findFirst({
        where: { email, emailVerified: true },
        include: {
          user: true,
        },
      });

      if (existingByEmail) {
        const user = existingByEmail.user;

        // Link this new provider to the existing account
        await this.linkIdentityToUser(user.id, provider, providerUserId, email, true);

        if (!user.mobileVerified) {
          const tempToken = this.generateTempToken(provider, providerUserId, email, true);
          return {
            accessToken: '',
            user: UserProfileDto.fromUser(user),
            requiresMobileVerification: true,
            tempToken,
          };
        }

        const userRoles = await this.prisma.userRole.findMany({
          where: { userId: user.id },
          include: { role: { select: { code: true, name: true } } },
        });
        return {
          ...this.tokensFor(user),
          user: UserProfileDto.fromUser(user, userRoles),
          requiresMobileVerification: false,
        };
      }
    }

    // Truly new user - need mobile verification
    const tempToken = this.generateTempToken(provider, providerUserId, email, emailVerified);

    return {
      accessToken: '',
      user: null as any,
      requiresMobileVerification: true,
      tempToken,
    };
  }

  private async createUser(
    mobileNumber: string,
    provider: Provider,
    providerUserId: string,
    email?: string,
    emailVerified = false,
  ): Promise<User> {
    const user = await this.prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          mobileNumber,
          mobileVerified: true,
          identities: {
            create: {
              provider,
              providerUserId,
              email,
              emailVerified: !!email && emailVerified,
            },
          },
        },
      });

      // P0.2: billing is per-Space now, not per-user. A user no longer gets a
      // subscription at signup — a STARTER row is minted when they create/own a
      // Space (see SpacesService). Legacy per-user rows remain until P2.2.

      return newUser;
    });

    this.logger.log(`Created new user ${user.id}`);

    // Send welcome email (non-blocking)
    if (email) {
      this.emailService.sendWelcomeEmail(
        email,
        user.fullName || user.username || 'there',
      ).catch(err => this.logger.error('Failed to send welcome email', err));
    }

    return user;
  }

  private async linkIdentityToUser(
    userId: string,
    provider: Provider,
    providerUserId: string,
    email?: string,
    emailVerified = false,
  ): Promise<void> {
    try {
      await this.prisma.userIdentity.create({
        data: {
          userId,
          provider,
          providerUserId,
          email,
          emailVerified: !!email && emailVerified,
        },
      });
    } catch (error) {
      // Identity might already exist
      this.logger.warn('Identity already linked', error);
    }
  }

  /** Throw the right 401 for a failed OTP check. */
  private assertOtpOk(result: OtpVerifyResult): void {
    if (result === 'blocked') {
      throw new UnauthorizedException(
        'Too many failed attempts. Please try again in 15 minutes.',
      );
    }
    if (result !== 'ok') {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
  }

  /**
   * Issue an access + refresh pair. Both carry `type` (so neither can stand in
   * for the other) and `tv`, the user's tokenVersion: bumping it revokes every
   * token issued before. The refresh token also carries a `jti` so it can be
   * revoked on its own (one-time use on rotate, and on logout).
   */
  private tokensFor(user: TokenUser): { accessToken: string; refreshToken: string } {
    const tv = user.tokenVersion ?? 0;
    return {
      accessToken: jwt.sign(
        { userId: user.id, type: 'access', tv },
        this.jwtSecret,
        { expiresIn: this.jwtExpiresIn } as jwt.SignOptions,
      ),
      refreshToken: jwt.sign(
        { userId: user.id, type: 'refresh', tv, jti: randomUUID() },
        this.jwtSecret,
        { expiresIn: this.refreshExpiresIn } as jwt.SignOptions,
      ),
    };
  }

  /**
   * Redis key that marks a refresh token as spent. Keyed by `jti`; refresh
   * tokens issued before S6 have none, so those are keyed by a hash of the
   * token itself. That keeps 4.0.5 sessions working: their old token is
   * accepted exactly once, then they hold a new jti token.
   */
  private spentRefreshKey(decoded: SessionTokenPayload, token: string): string {
    const id =
      typeof decoded.jti === 'string' && decoded.jti
        ? decoded.jti
        : `h:${createHash('sha256').update(token).digest('hex')}`;
    return `auth:refresh:spent:${id}`;
  }

  /** Seconds until the token expires (TTL for its spent marker). */
  private secondsLeft(decoded: SessionTokenPayload): number {
    const exp = typeof decoded.exp === 'number' ? decoded.exp : 0;
    return Math.max(1, exp - Math.floor(Date.now() / 1000));
  }

  /**
   * Mark a refresh token spent. Returns true when this call spent it, false
   * when it was already spent. Fails open (returns true) if Redis is down:
   * refresh then behaves as before S6 rather than logging everyone out.
   */
  private async spendRefreshToken(
    decoded: SessionTokenPayload,
    token: string,
    marker: string,
  ): Promise<boolean> {
    try {
      return await this.redis.setNx(
        this.spentRefreshKey(decoded, token),
        marker,
        this.secondsLeft(decoded),
      );
    } catch (err) {
      this.logger.warn(`refresh revocation store unavailable: ${(err as Error)?.message ?? err}`);
      return true;
    }
  }

  private async bumpTokenVersion(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  /**
   * Exchange a valid refresh token for a new access + refresh pair (rotation).
   * The presented token is spent: after REFRESH_REUSE_GRACE_MS it can't be
   * exchanged again.
   */
  async refreshSession(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded: SessionTokenPayload;
    try {
      decoded = jwt.verify(refreshToken, this.jwtSecret) as SessionTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (decoded.type !== 'refresh' || typeof decoded.userId !== 'string' || !decoded.userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, deletedAt: true, tokenVersion: true },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User no longer exists');
    }
    if ((decoded.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session revoked');
    }
    const spent = await this.spendRefreshToken(decoded, refreshToken, String(Date.now()));
    if (!spent) {
      // Already rotated. Inside the grace window this is a client retrying a
      // rotate whose response it lost, so it gets a fresh pair instead of being
      // logged out; after that the token is dead.
      const spentAt = Number(
        await this.redis.get(this.spentRefreshKey(decoded, refreshToken)).catch(() => null),
      );
      if (!spentAt || Date.now() - spentAt > REFRESH_REUSE_GRACE_MS) {
        this.logger.warn(`Spent refresh token reused for user ${user.id}`);
        throw new UnauthorizedException('Refresh token already used');
      }
    }
    return this.tokensFor(user);
  }

  private generateTempToken(
    provider: Provider,
    providerUserId: string,
    email?: string,
    emailVerified?: boolean,
  ): string {
    const payload: TempTokenPayload = {
      type: 'temp',
      provider,
      providerUserId,
      email,
      emailVerified: emailVerified === true,
    };
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '15m', // Temp token expires in 15 minutes
    } as jwt.SignOptions);
  }

  /**
   * Only a real temp token passes (S4): `type: 'temp'`, a known provider and a
   * non-empty providerUserId. Access/refresh tokens are signed with the same
   * secret, so the type claim is what keeps them out.
   */
  private verifyTempToken(token: string): TempTokenPayload {
    let decoded: Partial<TempTokenPayload> & { type?: unknown };
    try {
      decoded = jwt.verify(token, this.jwtSecret) as typeof decoded;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (
      decoded?.type !== 'temp' ||
      typeof decoded.provider !== 'string' ||
      !(Object.values(Provider) as string[]).includes(decoded.provider) ||
      typeof decoded.providerUserId !== 'string' ||
      !decoded.providerUserId
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return {
      type: 'temp',
      provider: decoded.provider,
      providerUserId: decoded.providerUserId,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
      emailVerified: decoded.emailVerified === true,
    };
  }

  /**
   * Accepts access tokens only. Tokens issued before S6 have no `type`/`tv`
   * and stay valid; refresh and temp tokens are refused. `tv` must match the
   * user's tokenVersion (bumped by logout with allDevices).
   */
  async validateAccessToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as SessionTokenPayload;
      if (decoded.type !== undefined && decoded.type !== 'access') {
        throw new UnauthorizedException('Invalid token');
      }
      if (typeof decoded.userId !== 'string' || !decoded.userId) {
        throw new UnauthorizedException('Invalid token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || user.deletedAt) {
        throw new UnauthorizedException('Invalid token');
      }
      if ((decoded.tv ?? 0) !== user.tokenVersion) {
        throw new UnauthorizedException('Session revoked');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Record that this user just made an authenticated request. Called by
   * JwtAuthGuard on every authenticated request, so it is throttled: it writes
   * at most once per LAST_SEEN_THROTTLE_MS per user. The in-memory check skips
   * the write without touching the DB; the conditional WHERE keeps concurrent
   * requests across replicas to a single write. Raw SQL so the write does not
   * bump `updated_at`, which should keep meaning "profile changed".
   * Fire-and-forget: never delays or fails the request.
   */
  touchLastSeen(user: Pick<User, 'id' | 'lastSeenAt'>): void {
    const now = Date.now();
    if (user.lastSeenAt && now - user.lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS) {
      return;
    }
    const cutoff = new Date(now - LAST_SEEN_THROTTLE_MS);
    this.prisma.$executeRaw`
      UPDATE users SET last_seen_at = now()
      WHERE id = ${user.id}::uuid
        AND (last_seen_at IS NULL OR last_seen_at < ${cutoff})
    `.catch((err) =>
      this.logger.warn(`touchLastSeen failed for ${user.id}: ${err?.message ?? err}`),
    );
  }

  /**
   * Revoke the caller's refresh token when they send it (4.0.5 clients don't,
   * for them this stays a no-op as before). `allDevices` bumps tokenVersion,
   * which kills every access and refresh token of the user at once.
   */
  async logout(
    userId: string,
    opts: { refreshToken?: unknown; allDevices?: unknown } = {},
  ): Promise<{ message: string }> {
    if (typeof opts.refreshToken === 'string' && opts.refreshToken) {
      try {
        const decoded = jwt.verify(opts.refreshToken, this.jwtSecret) as SessionTokenPayload;
        if (decoded.type === 'refresh' && decoded.userId === userId) {
          // Overwrite (not NX) so a token inside its rotate grace window dies too.
          await this.redis.set(
            this.spentRefreshKey(decoded, opts.refreshToken),
            'logout',
            this.secondsLeft(decoded),
          );
        }
      } catch {
        // Expired or forged: nothing to revoke.
      }
    }
    if (opts.allDevices === true) {
      await this.bumpTokenVersion(userId);
    }
    return { message: 'Logged out successfully' };
  }

  /**
   * Get user by ID (for Cognito JWT authentication flow)
   * Used by JwtAuthGuard when verifying Cognito tokens
   *
   * @param userId - User ID from Cognito 'sub' claim
   * @returns User object
   * @throws UnauthorizedException if user not found
   */
  async getUserById(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Login with Cognito token (Google/Apple via Cognito)
   *
   * Flow:
   * 1. Verify Cognito ID token
   * 2. Find existing user by Cognito identity OR email
   * 3. If found + mobile verified → return access token
   * 4. If found + mobile not verified → return temp token for mobile OTP
   * 5. If not found → create placeholder user → return temp token for mobile OTP
   */
  async loginWithCognito(idToken: string): Promise<AuthResponseDto> {
    if (!this.cognitoJwtService) {
      throw new UnauthorizedException('Cognito authentication not configured');
    }

    const payload = await this.cognitoJwtService.verifyCognitoToken(idToken);
    const email = payload.email;
    const emailVerified = isVerified(payload.email_verified);
    const cognitoSub = payload.sub;
    const rawProvider = payload['identities']?.[0]?.providerName?.toLowerCase() || 'cognito';
    const providerEnum = rawProvider === 'signinwithapple' ? Provider.APPLE : Provider.GOOGLE;

    if (!email) {
      throw new UnauthorizedException('Email not provided by identity provider');
    }

    this.logger.log(`[Cognito] email=${email} provider=${providerEnum} sub=${cognitoSub}`);

    // Step 1: Find user by existing Cognito identity
    let user: any = null;
    const existingIdentity = await this.prisma.userIdentity.findFirst({
      where: { provider: providerEnum, providerUserId: cognitoSub },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (existingIdentity) {
      user = existingIdentity.user;
    }

    // Steps 2-3 link by email, only when Cognito says the email is verified
    // (S5). Unverified: a new placeholder user is created below and the mobile
    // OTP step moves the identity onto the existing account if they prove its
    // mobile number.
    // Step 2: Find user by verified email identity (any provider)
    if (!user && emailVerified) {
      const identityByEmail = await this.prisma.userIdentity.findFirst({
        where: { email, emailVerified: true },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (identityByEmail) {
        user = identityByEmail.user;
        await this.linkIdentityToUser(user.id, providerEnum, cognitoSub, email, true);
      }
    }

    // Step 3: Find user by EMAIL provider identity (email OTP users)
    if (!user && emailVerified) {
      const emailIdentity = await this.prisma.userIdentity.findFirst({
        where: { provider: Provider.EMAIL, providerUserId: email },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (emailIdentity) {
        user = emailIdentity.user;
        await this.linkIdentityToUser(user.id, providerEnum, cognitoSub, email, true);
      }
    }

    // Step 4: User found + mobile verified → login directly
    if (user && user.mobileVerified) {
      return {
        ...this.tokensFor(user),
        user: UserProfileDto.fromUser(user, user.roles),
        requiresMobileVerification: false,
      };
    }

    // Step 5: User found + mobile not verified → require mobile OTP
    if (user && !user.mobileVerified) {
      const tempToken = this.generateTempToken(providerEnum, cognitoSub, email, emailVerified);
      return {
        accessToken: '',
        user: UserProfileDto.fromUser(user, user.roles),
        requiresMobileVerification: true,
        tempToken,
      };
    }

    // Step 6: New user → create with placeholder mobile + require mobile OTP
    const placeholderMobile = `+0${Date.now().toString().slice(-9)}`;
    const newUser = await this.prisma.user.create({
      data: {
        mobileNumber: placeholderMobile,
        mobileVerified: false,
        identities: {
          create: {
            provider: providerEnum,
            providerUserId: cognitoSub,
            email,
            emailVerified,
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });

    const tempToken = this.generateTempToken(providerEnum, cognitoSub, email, emailVerified);
    return {
      accessToken: '',
      user: UserProfileDto.fromUser(newUser, []),
      requiresMobileVerification: true,
      tempToken,
    };
  }
}