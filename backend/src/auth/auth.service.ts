import {
  Optional,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  HttpException,
  BadGatewayException,
  GoneException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { Prisma, Provider, User } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OtpService, OtpVerifyResult } from './otp.service';
import { CognitoJwtService } from './cognito-jwt.service';
import { AppleSignInService } from './apple-sign-in.service';
import { assertNotSuspended, isSuspended, type SuspensionFields } from './suspension';
import { findIdentityByEmail, normalizeEmail, normalizeMobile } from './identifiers';
import { describeDevice } from './device-label';
import {
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
  /** The AuthSession (linked device) the token belongs to. Absent before sessions. */
  sid?: unknown;
  /** Refresh only (J17): when the user signed in, carried across rotations. */
  at?: unknown;
  iat?: number;
  exp?: number;
}

type TokenUser = { id: string; tokenVersion: number } & SuspensionFields;

/** IdPs send `email_verified` as a boolean or the string "true". */
const isVerified = (v: unknown): boolean => v === true || v === 'true';

/**
 * A rotated refresh token still works for this long (a client retrying a
 * rotate whose response was lost). After that, and after logout, it is refused.
 * ponytail: no reuse-triggered revoke-all (flaky networks would log people
 * Presented again after that, the token was copied: J17 revokes the whole
 * family (tokenVersion bump), so the thief's rotated pair dies with it.
 */
const REFRESH_REUSE_GRACE_MS = 60 * 1000;

/** Redis marker for a token revoked by logout: refused, but not a theft signal. */
const LOGOUT_MARKER = 'logout';

/** App Store review login bypass; off unless this env var is exactly "true". */
const APP_REVIEW_EMAIL = 'test-user@unifesto.app';
const APP_REVIEW_OTP = '098765';

interface AppleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

/** Minimum gap between `users.last_seen_at` (and `auth_sessions.last_seen_at`) writes. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Emitted with the OneSignal subscription ids of app installs signed out from
 * elsewhere. NotificationsModule deletes them at OneSignal, so the phone stops
 * getting this user's pushes now instead of when the app next opens.
 */
export const PUSH_INSTALLS_SIGNED_OUT = 'auth.push-installs.signed-out';

/** QR sign-in: how long a browser's code can be scanned, approved and collected. */
const QR_TTL_SEC = 120;
const QR_EXPIRED = 'This code has expired. Show a new one on the computer.';
const qrKey = (code: string) => `auth:qr:${code}`;
/** What Redis holds for a code: a hash of the browser's secret, and the browser. */
interface QrLink {
  secret: string;
  userAgent: string | null;
}

/**
 * AuthService handles multi-provider authentication for Unifesto.
 *
 * AUTHENTICATION FLOW PRESERVATION:
 * This service maintains all existing authentication flows:
 * - Google (via Cognito, /auth/cognito)
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
  private readonly appleJwksClient: jwksClient.JwksClient;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly refreshMaxAgeSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly otpService: OtpService,
    private readonly redis: RedisService,
    private readonly cognitoJwtService?: CognitoJwtService, // Optional injection for future Cognito flows
    @Optional() private readonly appleSignIn?: AppleSignInService,
    @Optional() private readonly events?: EventEmitter2,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    // Refresh token lives well beyond the access token so the app can silently
    // renew the session instead of logging the user out.
    this.refreshExpiresIn = this.configService.get<string>(
      'REFRESH_EXPIRES_IN',
      '180d',
    );
    // J17: absolute session lifetime. Rotation can't stretch a sign-in past it.
    this.refreshMaxAgeSec =
      (Number(this.configService.get<string>('REFRESH_MAX_AGE_DAYS')) || 365) * 86400;

    // Initialize Apple JWKS client
    this.appleJwksClient = jwksClient({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });

    this.logger.log('AuthService initialized - all existing auth flows preserved');
  }

  // =====================================================
  // APPLE LOGIN
  // =====================================================
  async loginWithApple(dto: AppleLoginDto, userAgent?: string): Promise<AuthResponseDto> {
    try {
      // Verify Apple identity token
      const decoded = await this.verifyAppleToken(dto.identityToken);
      await this.storeAppleToken(decoded.sub, dto.authorizationCode);

      return await this.handleProviderLogin(
        Provider.APPLE,
        decoded.sub,
        decoded.email ? normalizeEmail(decoded.email) : undefined,
        isVerified(decoded.email_verified),
        userAgent,
      );
    } catch (error) {
      this.logger.error('Apple login failed', error);
      throw new UnauthorizedException('Apple authentication failed');
    }
  }

  /**
   * O17: swap the one-time code for a refresh token so account deletion can
   * revoke it. Never blocks sign-in. A new Apple ID has no identity row until
   * the mobile OTP step, so the token waits in Redis for the temp token's 15
   * minutes and claimAppleToken moves it over when the identity is created.
   */
  private async storeAppleToken(sub: string, code: string): Promise<void> {
    try {
      const token = await this.appleSignIn?.exchangeCode(code);
      if (!token) return;
      const { count } = await this.prisma.userIdentity.updateMany({
        where: { provider: Provider.APPLE, providerUserId: sub },
        data: { appleRefreshToken: token },
      });
      if (!count) await this.redis.set(`apple-rt:${sub}`, token, 15 * 60);
    } catch (err) {
      this.logger.warn(`Apple token exchange failed for ${sub}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async claimAppleToken(sub: string): Promise<void> {
    try {
      const token = await this.redis.get(`apple-rt:${sub}`);
      if (!token) return;
      await this.prisma.userIdentity.updateMany({
        where: { provider: Provider.APPLE, providerUserId: sub },
        data: { appleRefreshToken: token },
      });
      await this.redis.del(`apple-rt:${sub}`);
    } catch (err) {
      this.logger.warn(`Apple token claim failed for ${sub}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async verifyAppleToken(token: string): Promise<AppleTokenPayload> {
    // J17: jwt.verify skips the audience check when it's undefined, which let
    // any app's Apple token in. No configured audience means no Apple login.
    const audience = this.configService.get<string>('APPLE_CLIENT_ID');
    if (!audience) throw new UnauthorizedException('Apple sign-in is not configured');
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
          audience,
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
    const email = normalizeEmail(dto.email);
    await this.otpService.assertCanSend(email, ip);
    await this.sendCode(email, ip, (otp) => this.emailService.sendOtpEmail(email, otp));
    return {
      message: 'OTP sent to email. Use the OTP to complete authentication.',
    };
  }

  /**
   * Store a fresh code and deliver it. J17: a failed delivery is a 502 (never
   * "OTP sent") and hands the send slot back, so provider outages don't burn
   * the user's daily cap.
   */
  private async sendCode(
    identifier: string,
    ip: string | undefined,
    deliver: (otp: string) => Promise<boolean>,
  ): Promise<void> {
    const otp = this.otpService.generateOtp();
    let sent = false;
    try {
      await this.otpService.storeOtp(identifier, otp);
      sent = await deliver(otp);
    } catch (error) {
      if (isUnavailable(error)) throw error;
      this.logger.error('OTP delivery failed', error);
    }
    if (!sent) {
      await this.otpService.releaseSend(identifier, ip).catch(() => undefined);
      throw new BadGatewayException("We couldn't send your code right now. Please try again.");
    }
  }

  async verifyEmailOtp(
    rawEmail: string,
    otp: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const email = normalizeEmail(rawEmail);
    try {
      // App Review bypass: static test account, only while a platform admin
      // has it on in Apex › App version. Read fresh (not the per-replica
      // config cache) so turning it off takes effect on every replica at once.
      if (
        email === APP_REVIEW_EMAIL &&
        otp === APP_REVIEW_OTP &&
        (
          await this.prisma.platformConfig.findUnique({
            where: { id: 'global' },
            select: { appReviewLoginEnabled: true },
          })
        )?.appReviewLoginEnabled
      ) {
        return await this.handleProviderLogin(
          Provider.EMAIL,
          email,
          email,
          true,
          userAgent,
        );
      }

      this.assertOtpOk(await this.otpService.verifyOtp(email, otp, ip));

      this.logger.log(`Handling provider login for email: ${email}`);

      return await this.handleProviderLogin(
        Provider.EMAIL,
        email, // Use email as provider user ID for email auth
        email,
        true,
        userAgent,
      );
    } catch (error) {
      this.logger.error('Email OTP verification failed', error);
      if (error instanceof UnauthorizedException || isUnavailable(error)) {
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
      const mobile = this.otpMobile(dto.mobileNumber);
      await this.otpService.assertCanSend(mobile, ip);
      await this.sendCode(mobile, ip, (otp) => this.whatsappService.sendOtp(mobile, otp));

      return {
        message: 'OTP sent to your WhatsApp',
      };
    } catch (error) {
      if (error instanceof HttpException && [400, 429, 502, 503].includes(error.getStatus())) throw error;
      this.logger.error('Mobile OTP send failed', error);
      throw new BadRequestException('Failed to send mobile OTP');
    }
  }

  async verifyMobile(dto: VerifyMobileDto, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    try {
      // Verify temp token
      const decoded = this.verifyTempToken(dto.tempToken);
      const mobileNumber = normalizeMobile(dto.mobileNumber);
      if (!mobileNumber) throw new UnauthorizedException('Invalid or expired OTP');

      this.assertOtpOk(
        await this.otpService.verifyOtp(mobileNumber, dto.otp, ip),
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
          where: { mobileNumber },
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
            ...(await this.startSession(existingMobileUser, userAgent)),
            user: UserProfileDto.fromUser(existingMobileUser, userRoles),
            requiresMobileVerification: false,
            isNewUser: false,
          };
        }

        // Update the existing Cognito user with real mobile number
        const updatedUser = await this.prisma.user.update({
          where: { id: cognitoUser.user.id },
          data: {
            mobileNumber,
            mobileVerified: true,
          },
        });
        return {
          ...(await this.startSession(updatedUser, userAgent)),
          user: UserProfileDto.fromUser(updatedUser),
          requiresMobileVerification: false,
        };
      }

      // Check if mobile number already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { mobileNumber },
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
          ...(await this.startSession(existingUser, userAgent)),
          user: UserProfileDto.fromUser(existingUser),
          requiresMobileVerification: false,
          isNewUser: false,
        };
      } else {
        // Create new user
        const newUser = await this.createUser(
          mobileNumber,
          decoded.provider,
          decoded.providerUserId,
          decoded.email,
          decoded.emailVerified === true,
        );

        return {
          ...(await this.startSession(newUser, userAgent)),
          user: UserProfileDto.fromUser(newUser),
          requiresMobileVerification: false,
          isNewUser: true,
        };
      }
    } catch (error) {
      this.logger.error('Mobile verification failed', error);
      if (error instanceof UnauthorizedException || error instanceof ConflictException || isUnavailable(error)) {
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
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    // Check if identity already exists. Email-OTP identities written before
    // J17 may be mixed-case, so those also match in any case.
    const existingIdentity =
      (await this.prisma.userIdentity.findUnique({
        where: {
          unique_provider_user: {
            provider,
            providerUserId,
          },
        },
        include: {
          user: true,
        },
      })) ??
      (provider === Provider.EMAIL
        ? await findIdentityByEmail(this.prisma, providerUserId, { include: { user: true } }, 'providerUserId')
        : null);

    if (existingIdentity) {
      // An identity made for someone (an attendee import) is unverified until
      // they prove the email by signing in with it; seat claims need that (A28).
      // The temp token carries the stored id, so the mobile step finds it again.
      providerUserId = existingIdentity.providerUserId;
      if (emailVerified && email && !existingIdentity.emailVerified) {
        await this.prisma.userIdentity.update({
          where: { id: existingIdentity.id },
          data: { emailVerified: true },
        });
      }

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
        ...(await this.startSession(user, userAgent)),
        user: UserProfileDto.fromUser(user, userRoles),
        requiresMobileVerification: false,
      };
    }

    // No exact identity match: link to an existing account by email, but only
    // when the IdP vouches for the email AND the existing identity's email was
    // verified (S5). Otherwise fall through to the new-user path: mobile OTP,
    // which links to the existing account only if they prove its mobile.
    if (email && emailVerified) {
      const existingByEmail = await findIdentityByEmail(this.prisma, email, {
        where: { emailVerified: true },
        include: { user: true },
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
          ...(await this.startSession(user, userAgent)),
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
    if (provider === Provider.APPLE) await this.claimAppleToken(providerUserId);

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
      if (provider === Provider.APPLE) await this.claimAppleToken(providerUserId);
      return;
    }
    if (provider === Provider.APPLE) await this.claimAppleToken(providerUserId);
    this.notifySignInMethodAdded(userId, provider).catch((err) =>
      this.logger.error(`sign-in method notice failed for ${userId}`, err),
    );
  }

  /** J17: tell every email on the account that a new sign-in method was linked. */
  private async notifySignInMethodAdded(userId: string, provider: Provider): Promise<void> {
    const identities = await this.prisma.userIdentity.findMany({
      where: { userId, email: { not: null } },
      select: { email: true },
    });
    const emails = new Set(identities.map((i) => i.email!.toLowerCase()));
    const method = { GOOGLE: 'Google', APPLE: 'Apple', EMAIL: 'Email sign-in codes', PHONE: 'Phone' }[provider];
    for (const email of emails) await this.emailService.sendSignInMethodAdded(email, method);
  }

  /**
   * The E.164 number a WhatsApp code may go to. J17: only allowlisted country
   * codes (`OTP_WHATSAPP_COUNTRY_CODES`, default India) since every OTP is a
   * paid template and there's no budget for the rest of the world.
   */
  private otpMobile(raw: string): string {
    const mobile = normalizeMobile(raw);
    if (!mobile) throw new BadRequestException('Enter a valid mobile number.');
    const codes = (this.configService.get<string>('OTP_WHATSAPP_COUNTRY_CODES') || '91')
      .split(',')
      .map((c) => c.trim().replace(/^\+/, ''))
      .filter(Boolean);
    if (!codes.some((cc) => mobile.startsWith(`+${cc}`))) {
      throw new BadRequestException(
        `Sign-in codes can only be sent to ${codes.map((c) => `+${c}`).join(', ')} numbers right now.`,
      );
    }
    return mobile;
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
   * revoked on its own (one-time use on rotate, and on logout). Both carry
   * `sid`, the linked device they belong to.
   */
  private tokensFor(
    user: TokenUser,
    sid: string,
    authTime = Math.floor(Date.now() / 1000),
  ): { accessToken: string; refreshToken: string } {
    // F4: no new session for a suspended or banned account (login and refresh).
    assertNotSuspended(user);
    const tv = user.tokenVersion ?? 0;
    return {
      accessToken: jwt.sign(
        { userId: user.id, type: 'access', tv, sid },
        this.jwtSecret,
        { expiresIn: this.jwtExpiresIn } as jwt.SignOptions,
      ),
      refreshToken: jwt.sign(
        { userId: user.id, type: 'refresh', tv, sid, jti: randomUUID(), at: authTime },
        this.jwtSecret,
        { expiresIn: this.refreshExpiresIn } as jwt.SignOptions,
      ),
    };
  }

  private async newSession(userId: string, userAgent?: string, createdAt?: Date): Promise<string> {
    const { id } = await this.prisma.authSession.create({
      data: { userId, userAgent: userAgent?.slice(0, 400) || null, ...(createdAt ? { createdAt } : {}) },
      select: { id: true },
    });
    return id;
  }

  /** A sign-in: a new linked device, then its tokens. */
  private async startSession(user: TokenUser, userAgent?: string) {
    assertNotSuspended(user);
    return this.tokensFor(user, await this.newSession(user.id, userAgent));
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

  /**
   * Sign the user out everywhere: the tokenVersion bump kills every token, the
   * rows leave the linked devices list, and every phone stops getting their
   * pushes. Logout-all, refresh-token reuse, and Apex's force logout / suspend.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.endSessions(userId, 'all');
  }

  /**
   * Drop sessions signed out from elsewhere, and the push installs they
   * registered ('all': every install of the user, older ones without a
   * session too), then detach those installs at OneSignal.
   */
  private async endSessions(userId: string, ids: string[] | 'all'): Promise<void> {
    const pushWhere = ids === 'all' ? { userId } : { userId, sessionId: { in: ids } };
    const installs = await this.prisma.userPushDevice.findMany({
      where: pushWhere,
      select: { subscriptionId: true },
    });
    await this.prisma.userPushDevice.deleteMany({ where: pushWhere });
    await this.prisma.authSession.deleteMany({
      where: ids === 'all' ? { userId } : { userId, id: { in: ids } },
    });
    if (installs.length) {
      this.events?.emit(PUSH_INSTALLS_SIGNED_OUT, installs.map((i) => i.subscriptionId));
    }
  }

  /**
   * My linked devices, most recently active first.
   * ponytail: a session idle past REFRESH_EXPIRES_IN (180d) stays listed until
   * the absolute cap; add a sweep if stale rows start to confuse people.
   */
  async listSessions(userId: string, currentSid?: string) {
    const rows = await this.prisma.authSession.findMany({
      where: { userId, createdAt: { gt: new Date(Date.now() - this.refreshMaxAgeSec * 1000) } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        pushDevices: { select: { platform: true, deviceModel: true }, take: 1 },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      ...describeDevice(s.userAgent, s.pushDevices[0]),
      current: s.id === currentSid,
      signedInAt: s.createdAt,
      lastActiveAt: s.lastSeenAt,
    }));
  }

  /** Sign one of my devices out. Its tokens fail on their next request. */
  async revokeSession(userId: string, sid: string): Promise<{ revoked: true }> {
    if (!(await this.prisma.authSession.count({ where: { id: sid, userId } }))) {
      throw new NotFoundException('That device is already signed out');
    }
    await this.endSessions(userId, [sid]);
    return { revoked: true };
  }

  // =====================================================
  // QR SIGN-IN: a browser shows a code, my signed-in phone approves it
  // =====================================================

  /**
   * The browser's half: `code` goes in the QR, `secret` stays in the page and
   * is what collects the session, so a photo of the screen can't.
   */
  async startQrLink(userAgent?: string): Promise<{ code: string; secret: string; expiresIn: number }> {
    const code = randomBytes(18).toString('base64url');
    const secret = randomBytes(18).toString('base64url');
    const link: QrLink = {
      secret: createHash('sha256').update(secret).digest('hex'),
      userAgent: userAgent?.slice(0, 400) || null,
    };
    await this.redis.set(qrKey(code), JSON.stringify(link), QR_TTL_SEC);
    return { code, secret, expiresIn: QR_TTL_SEC };
  }

  private async qrLink(code: unknown): Promise<QrLink> {
    const raw =
      typeof code === 'string' && /^[\w-]{16,64}$/.test(code)
        ? await this.redis.get(qrKey(code)).catch(() => null)
        : null;
    if (!raw) throw new GoneException(QR_EXPIRED);
    return JSON.parse(raw) as QrLink;
  }

  /** What my phone shows before I approve: which browser is asking. */
  async previewQrLink(code: string): Promise<{ name: string }> {
    return { name: describeDevice((await this.qrLink(code)).userAgent).name };
  }

  /** My phone approves: the browser's next poll is signed in as me. The first approval wins. */
  async approveQrLink(userId: string, code: string): Promise<{ approved: true }> {
    await this.qrLink(code);
    if (!(await this.redis.setNx(`${qrKey(code)}:by`, userId, QR_TTL_SEC))) {
      throw new ConflictException('This code was already used. Show a new one on the computer.');
    }
    return { approved: true };
  }

  /** The browser polls: pending until a phone approves, then its own session, handed out once. */
  async pollQrLink(
    code: unknown,
    secret: unknown,
  ): Promise<
    | { status: 'pending' }
    | { status: 'approved'; accessToken: string; refreshToken: string; fullName: string | null }
  > {
    const link = await this.qrLink(code);
    const key = qrKey(code as string);
    if (typeof secret !== 'string' || createHash('sha256').update(secret).digest('hex') !== link.secret) {
      throw new GoneException(QR_EXPIRED);
    }
    const userId = await this.redis.get(`${key}:by`);
    if (!userId) return { status: 'pending' };
    // Two polls in flight: only one gets the session.
    if (!(await this.redis.setNx(`${key}:claimed`, '1', QR_TTL_SEC))) return { status: 'pending' };
    await this.redis.del(key);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new GoneException(QR_EXPIRED);
    // The browser's own user agent, from when it asked for the code.
    const tokens = await this.startSession(user, link.userAgent ?? undefined);
    return { status: 'approved', ...tokens, fullName: user.fullName };
  }

  /**
   * Exchange a valid refresh token for a new access + refresh pair (rotation).
   * The presented token is spent: after REFRESH_REUSE_GRACE_MS it can't be
   * exchanged again, and trying revokes every session of the user.
   */
  async refreshSession(
    refreshToken: string,
    userAgent?: string,
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
      select: { id: true, deletedAt: true, tokenVersion: true, suspendedAt: true, suspendedUntil: true },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User no longer exists');
    }
    if ((decoded.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session revoked');
    }
    // Pre-J17 tokens have no `at`; their own iat is the best sign-in time we have.
    const authTime = typeof decoded.at === 'number' ? decoded.at : (decoded.iat ?? 0);
    if (Math.floor(Date.now() / 1000) - authTime > this.refreshMaxAgeSec) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }
    // Signed out on that device, or from another one: its row is gone.
    let sid = typeof decoded.sid === 'string' ? decoded.sid : null;
    if (sid) {
      const { count } = await this.prisma.authSession.updateMany({
        where: { id: sid, userId: user.id },
        data: { lastSeenAt: new Date() },
      });
      if (!count) throw new UnauthorizedException('Session revoked');
    }
    const spent = await this.spendRefreshToken(decoded, refreshToken, String(Date.now()));
    if (!spent) {
      // Already rotated. Inside the grace window this is a client retrying a
      // rotate whose response it lost, so it gets a fresh pair instead of being
      // logged out; after that the token is dead.
      const marker = await this.redis
        .get(this.spentRefreshKey(decoded, refreshToken))
        .catch(() => null);
      if (marker === LOGOUT_MARKER) {
        throw new UnauthorizedException('Refresh token already used');
      }
      const spentAt = Number(marker);
      if (!spentAt || Date.now() - spentAt > REFRESH_REUSE_GRACE_MS) {
        this.logger.warn(`Spent refresh token reused for user ${user.id}; revoking all sessions`);
        await this.revokeAllSessions(user.id);
        throw new UnauthorizedException('Refresh token already used');
      }
    }
    // Tokens from before linked devices get their row now, dated to the sign-in.
    if (!sid) {
      assertNotSuspended(user);
      sid = await this.newSession(user.id, userAgent, new Date(authTime * 1000));
    }
    return this.tokensFor(user, sid, authTime);
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

      const sid = typeof decoded.sid === 'string' ? decoded.sid : null;
      const [user, session] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: decoded.userId } }),
        sid
          ? this.prisma.authSession.findUnique({ where: { id: sid }, select: { userId: true, lastSeenAt: true } })
          : null,
      ]);

      if (!user || user.deletedAt || isSuspended(user)) {
        throw new UnauthorizedException('Invalid token');
      }
      if ((decoded.tv ?? 0) !== user.tokenVersion) {
        throw new UnauthorizedException('Session revoked');
      }
      // Signed out on that device, or from another one.
      if (sid && session?.userId !== user.id) {
        throw new UnauthorizedException('Session revoked');
      }
      // J17: logged out on this device. Fails open if Redis is down.
      if (await this.redis.get(this.revokedAccessKey(token)).catch(() => null)) {
        throw new UnauthorizedException('Session revoked');
      }

      if (sid && session) this.touchSession(sid, session.lastSeenAt);
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

  /** Same throttle for the linked device's "last active". Matching the old stamp keeps replicas to one write. */
  private touchSession(id: string, lastSeenAt: Date): void {
    if (Date.now() - lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS) return;
    this.prisma.authSession
      .updateMany({ where: { id, lastSeenAt }, data: { lastSeenAt: new Date() } })
      .catch((err) => this.logger.warn(`touchSession failed for ${id}: ${err?.message ?? err}`));
  }

  /**
   * Revoke the caller's refresh token when they send it (4.0.5 clients don't,
   * for them this stays a no-op as before), and end this device's session.
   * `allDevices` signs out everywhere (revokeAllSessions).
   */
  async logout(
    userId: string,
    opts: { refreshToken?: unknown; allDevices?: unknown; accessToken?: unknown } = {},
  ): Promise<{ message: string }> {
    let sid: unknown;
    if (typeof opts.refreshToken === 'string' && opts.refreshToken) {
      try {
        const decoded = jwt.verify(opts.refreshToken, this.jwtSecret) as SessionTokenPayload;
        if (decoded.type === 'refresh' && decoded.userId === userId) {
          sid = decoded.sid;
          // Overwrite (not NX) so a token inside its rotate grace window dies too.
          await this.redis.set(
            this.spentRefreshKey(decoded, opts.refreshToken),
            LOGOUT_MARKER,
            this.secondsLeft(decoded),
          );
        }
      } catch {
        // Expired or forged: nothing to revoke.
      }
    }
    // J17: kill the access token the logout came with, so a copied one
    // (operator tokens are JS-readable) stops working now, not at its expiry.
    if (typeof opts.accessToken === 'string' && opts.accessToken) {
      try {
        const decoded = jwt.verify(opts.accessToken, this.jwtSecret) as SessionTokenPayload;
        if (decoded.userId === userId) {
          sid ??= decoded.sid;
          await this.redis.set(
            this.revokedAccessKey(opts.accessToken),
            '1',
            this.secondsLeft(decoded),
          );
        }
      } catch (err) {
        if (!(err instanceof jwt.JsonWebTokenError)) {
          this.logger.warn(`access revocation failed: ${(err as Error)?.message ?? err}`);
        }
      }
    }
    if (opts.allDevices === true) {
      await this.revokeAllSessions(userId);
    } else if (typeof sid === 'string') {
      // This device leaves the list (its other access tokens die with the row).
      // The app signs its own push install out of OneSignal.
      await this.prisma.authSession.deleteMany({ where: { id: sid, userId } });
    }
    return { message: 'Logged out successfully' };
  }

  /** Redis key for a logged-out access token (hashed: pre-S6 tokens have no jti). */
  private revokedAccessKey(token: string): string {
    return `auth:access:revoked:${createHash('sha256').update(token).digest('hex')}`;
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

    if (!user || user.deletedAt || isSuspended(user)) {
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
  async loginWithCognito(idToken: string, userAgent?: string): Promise<AuthResponseDto> {
    if (!this.cognitoJwtService) {
      throw new UnauthorizedException('Cognito authentication not configured');
    }

    const payload = await this.cognitoJwtService.verifyCognitoToken(idToken);
    const email = payload.email ? normalizeEmail(payload.email) : undefined;
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
      const identityByEmail = await findIdentityByEmail(this.prisma, email, {
        where: { emailVerified: true },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (identityByEmail) {
        user = identityByEmail.user;
        await this.linkIdentityToUser(user.id, providerEnum, cognitoSub, email, true);
      }
    }

    // Step 3: Find user by EMAIL provider identity (email OTP users)
    if (!user && emailVerified) {
      const emailIdentity = await findIdentityByEmail(
        this.prisma,
        email,
        { include: { user: { include: { roles: { include: { role: true } } } } } },
        'providerUserId',
      );
      if (emailIdentity) {
        user = emailIdentity.user;
        await this.linkIdentityToUser(user.id, providerEnum, cognitoSub, email, true);
      }
    }

    // Step 4: User found + mobile verified → login directly
    if (user && user.mobileVerified) {
      return {
        ...(await this.startSession(user, userAgent)),
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

/** Redis down (OtpService 503): say so instead of "invalid OTP". */
function isUnavailable(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() === 503;
}
