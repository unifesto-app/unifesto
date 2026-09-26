import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import * as jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import jwksClient from 'jwks-rsa';
import { Provider, User } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OtpService } from './otp.service';
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

interface DecodedToken {
  userId?: string;
  provider: string;
  providerUserId: string;
  email?: string;
  iat: number;
  exp: number;
}

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
  email_verified?: boolean;
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
    private readonly cache: CacheService,
    private readonly cognitoJwtService?: CognitoJwtService, // Optional injection for future Cognito flows
  ) {
    // Note: WalletService and SubscriptionService are injected via lazy loading pattern
    // to avoid circular dependencies
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
        decoded.email_verified,
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
  async loginWithEmail(dto: EmailLoginDto): Promise<{ message: string }> {
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

  async verifyEmailOtp(email: string, otp: string): Promise<AuthResponseDto> {
    try {
      this.logger.log(`Verifying email OTP for: ${email}`);
      this.logger.log(`OTP received: ${otp}`);

      // Apple App Review bypass — static test account
      if (email === 'test-user@unifesto.app' && otp === '098765') {
        return await this.handleProviderLogin(
          Provider.EMAIL,
          email,
          email,
          true,
        );
      }

      // Check if OTP attempts are blocked
      const isBlocked = await this.cache.isOtpBlocked(email);
      if (isBlocked) {
        throw new UnauthorizedException('Too many failed attempts. Please try again in 15 minutes.');
      }
      
      // Verify OTP
      const isValid = await this.otpService.verifyOtp(email, otp);
      
      this.logger.log(`OTP validation result: ${isValid}`);
      
      if (!isValid) {
        // Track failed attempt
        const failCount = await this.cache.trackFailedOtp(email);
        this.logger.warn(`Failed OTP attempt ${failCount} for ${email}`);
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      // Clear failed attempts on success
      await this.cache.clearFailedOtp(email);

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
  async sendMobileOtp(dto: SendMobileOtpDto): Promise<{ message: string }> {
    try {
      // Verify temp token
      const decoded = this.verifyTempToken(dto.tempToken);

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
      this.logger.error('Mobile OTP send failed', error);
      throw new BadRequestException('Failed to send mobile OTP');
    }
  }

  async verifyMobile(dto: VerifyMobileDto): Promise<AuthResponseDto> {
    try {
      // Verify temp token
      const decoded = this.verifyTempToken(dto.tempToken);

      // Check if OTP attempts are blocked
      const isBlocked = await this.cache.isOtpBlocked(dto.mobileNumber);
      if (isBlocked) {
        throw new UnauthorizedException('Too many failed attempts. Please try again in 15 minutes.');
      }

      // Verify OTP
      const isValid = await this.otpService.verifyOtp(dto.mobileNumber, dto.otp);
      
      if (!isValid) {
        // Track failed attempt
        const failCount = await this.cache.trackFailedOtp(dto.mobileNumber);
        this.logger.warn(`Failed mobile OTP attempt ${failCount} for ${dto.mobileNumber}`);
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      // Clear failed attempts on success
      await this.cache.clearFailedOtp(dto.mobileNumber);

      // Check if a Cognito user already exists with this provider identity (placeholder mobile)
      const cognitoUser = await this.prisma.userIdentity.findFirst({
        where: {
          provider: decoded.provider as Provider,
          providerUserId: decoded.providerUserId,
        },
        include: { user: true },
      });

      if (cognitoUser && !cognitoUser.user.mobileVerified) {
        // Check if mobile number already belongs to another user
        const existingMobileUser = await this.prisma.user.findUnique({
          where: { mobileNumber: dto.mobileNumber },
        });

        if (existingMobileUser) {
          // Mobile belongs to existing user
          // Transfer the Cognito identity from placeholder to existing user
          await this.prisma.userIdentity.updateMany({
            where: {
              provider: decoded.provider as Provider,
              providerUserId: decoded.providerUserId,
            },
            data: { userId: existingMobileUser.id },
          });
          // Delete placeholder user (identities already moved)
          await this.prisma.user.delete({
            where: { id: cognitoUser.user.id },
          }).catch(() => {});
          const accessToken = this.generateAccessToken(existingMobileUser.id);
          const userRoles = await this.prisma.userRole.findMany({
            where: { userId: existingMobileUser.id },
            include: { role: { select: { code: true, name: true } } },
          });
          return {
            accessToken,
            refreshToken: this.generateRefreshToken(existingMobileUser.id),
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
        const accessToken = this.generateAccessToken(updatedUser.id);
        return {
          accessToken,
          refreshToken: this.generateRefreshToken(updatedUser.id),
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
          decoded.provider as Provider,
          decoded.providerUserId,
          decoded.email,
        );

        // Generate access token
        const accessToken = this.generateAccessToken(existingUser.id);

        return {
          accessToken,
          refreshToken: this.generateRefreshToken(existingUser.id),
          user: UserProfileDto.fromUser(existingUser),
          requiresMobileVerification: false,
          isNewUser: false,
        };
      } else {
        // Create new user
        const newUser = await this.createUser(
          dto.mobileNumber,
          decoded.provider as Provider,
          decoded.providerUserId,
          decoded.email,
        );

        const accessToken = this.generateAccessToken(newUser.id);

        // Send welcome message via WhatsApp
        if (newUser.username) {
          await this.whatsappService.sendWelcomeMessage(
            dto.mobileNumber,
            newUser.username,
          );
        }

        return {
          accessToken,
          refreshToken: this.generateRefreshToken(newUser.id),
          user: UserProfileDto.fromUser(newUser),
          requiresMobileVerification: false,
          isNewUser: true,
        };
      }
    } catch (error) {
      this.logger.error('Mobile verification failed', error);
      if (error instanceof UnauthorizedException) {
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
        const tempToken = this.generateTempToken(provider, providerUserId, email);

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
      // Generate access token
      const accessToken = this.generateAccessToken(user.id);

      return {
        accessToken,
        refreshToken: this.generateRefreshToken(user.id),
        user: UserProfileDto.fromUser(user, userRoles),
        requiresMobileVerification: false,
      };
    }

    // No exact identity match — check if email already exists on another identity
    if (email) {
      const existingByEmail = await this.prisma.userIdentity.findFirst({
        where: { email },
        include: {
          user: true,
        },
      });

      if (existingByEmail) {
        const user = existingByEmail.user;

        // Link this new provider to the existing account
        await this.linkIdentityToUser(user.id, provider, providerUserId, email);

        if (!user.mobileVerified) {
          const tempToken = this.generateTempToken(provider, providerUserId, email);
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
        const accessToken = this.generateAccessToken(user.id);
        return {
          accessToken,
          refreshToken: this.generateRefreshToken(user.id),
          user: UserProfileDto.fromUser(user, userRoles),
          requiresMobileVerification: false,
        };
      }
    }

    // Truly new user - need mobile verification
    const tempToken = this.generateTempToken(provider, providerUserId, email);

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
              emailVerified: !!email,
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
  ): Promise<void> {
    try {
      await this.prisma.userIdentity.create({
        data: {
          userId,
          provider,
          providerUserId,
          email,
          emailVerified: !!email,
        },
      });
    } catch (error) {
      // Identity might already exist
      this.logger.warn('Identity already linked', error);
    }
  }

  private generateAccessToken(userId: string): string {
    return jwt.sign({ userId }, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    } as jwt.SignOptions);
  }

  /**
   * A long-lived refresh token. Stateless (like the access token) and marked
   * with `type: 'refresh'` so it can never be used as an access token. The app
   * stores it and exchanges it at /auth/refresh when the access token expires.
   */
  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId, type: 'refresh' }, this.jwtSecret, {
      expiresIn: this.refreshExpiresIn,
    } as jwt.SignOptions);
  }

  /** Issue a fresh access + refresh token pair for a user. */
  issueTokens(userId: string): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.generateAccessToken(userId),
      refreshToken: this.generateRefreshToken(userId),
    };
  }

  /**
   * Exchange a valid refresh token for a new access + refresh pair (rotation).
   * Rejects access tokens or anything not signed as a refresh token, and
   * confirms the user still exists.
   */
  async refreshSession(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded: { userId?: string; type?: string };
    try {
      decoded = jwt.verify(refreshToken, this.jwtSecret) as {
        userId?: string;
        type?: string;
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (decoded.type !== 'refresh' || !decoded.userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User no longer exists');
    }
    return this.issueTokens(user.id);
  }

  private generateTempToken(
    provider: Provider,
    providerUserId: string,
    email?: string,
  ): string {
    return jwt.sign(
      {
        provider,
        providerUserId,
        email,
      },
      this.jwtSecret,
      {
        expiresIn: '15m', // Temp token expires in 15 minutes
      } as jwt.SignOptions,
    );
  }

  private verifyTempToken(token: string): DecodedToken {
    try {
      return jwt.verify(token, this.jwtSecret) as DecodedToken;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async validateAccessToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || user.deletedAt) {
        throw new UnauthorizedException('Invalid token');
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

  async logout(userId: string): Promise<{ message: string }> {
    // In a stateless JWT system, logout is handled client-side
    // Optionally, implement token blacklisting here
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

    // Step 2: Find user by email identity (any provider)
    if (!user) {
      const identityByEmail = await this.prisma.userIdentity.findFirst({
        where: { email },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (identityByEmail) {
        user = identityByEmail.user;
        await this.linkIdentityToUser(user.id, providerEnum, cognitoSub, email);
      }
    }

    // Step 3: Find user by EMAIL provider identity (email OTP users)
    if (!user) {
      const emailIdentity = await this.prisma.userIdentity.findFirst({
        where: { provider: Provider.EMAIL, providerUserId: email },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (emailIdentity) {
        user = emailIdentity.user;
        await this.linkIdentityToUser(user.id, providerEnum, cognitoSub, email);
      }
    }

    // Step 4: User found + mobile verified → login directly
    if (user && user.mobileVerified) {
      const accessToken = this.generateAccessToken(user.id);
      return {
        accessToken,
        refreshToken: this.generateRefreshToken(user.id),
        user: UserProfileDto.fromUser(user, user.roles),
        requiresMobileVerification: false,
      };
    }

    // Step 5: User found + mobile not verified → require mobile OTP
    if (user && !user.mobileVerified) {
      const tempToken = this.generateTempToken(providerEnum, cognitoSub, email);
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
            emailVerified: true,
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });

    const tempToken = this.generateTempToken(providerEnum, cognitoSub, email);
    return {
      accessToken: '',
      user: UserProfileDto.fromUser(newUser, []),
      requiresMobileVerification: true,
      tempToken,
    };
  }
}