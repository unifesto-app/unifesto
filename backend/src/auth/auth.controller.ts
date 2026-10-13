import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  GoogleLoginDto,
  AppleLoginDto,
  EmailLoginDto,
  SendMobileOtpDto,
  VerifyMobileDto,
  AuthResponseDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login with Google
   * POST /auth/google
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
  ): Promise<AuthResponseDto> {
    return this.authService.loginWithGoogle(dto);
  }

  /**
   * Login with Apple
   * POST /auth/apple
   */
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async loginWithApple(@Body() dto: AppleLoginDto): Promise<AuthResponseDto> {
    return this.authService.loginWithApple(dto);
  }

  /**
   * Send Email OTP
   * POST /auth/email
   */
  @Post('cognito')
  @ApiOperation({ summary: 'Login with Cognito ID token (Google/Apple via Cognito)' })
  @ApiResponse({ status: 200 })
  async loginWithCognito(@Body() body: { idToken: string }): Promise<AuthResponseDto> {
    return this.authService.loginWithCognito(body.idToken);
  }

  @Post('email')
  // Per-IP coarse limit. Kept generous because a whole campus can share one NAT
  // public IP during an event; real abuse protection is the per-account OTP
  // attempt counter + 15-min lockout in OtpService/auth.service.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async loginWithEmail(
    @Body() dto: EmailLoginDto,
  ): Promise<{ message: string }> {
    return this.authService.loginWithEmail(dto);
  }

  /**
   * Verify Email OTP
   * POST /auth/email/verify
   */
  @Post('email/verify')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(
    @Body() body: { email: string; otp: string },
  ): Promise<AuthResponseDto> {
    return this.authService.verifyEmailOtp(body.email, body.otp);
  }

  /**
   * Send Mobile OTP
   * POST /auth/mobile/send-otp
   */
  @Post('mobile/send-otp')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async sendMobileOtp(
    @Body() dto: SendMobileOtpDto,
  ): Promise<{ message: string }> {
    return this.authService.sendMobileOtp(dto);
  }

  /**
   * Verify Mobile Number
   * POST /auth/verify-mobile
   */
  @Post('verify-mobile')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyMobile(@Body() dto: VerifyMobileDto): Promise<AuthResponseDto> {
    return this.authService.verifyMobile(dto);
  }

  /**
   * Get Current Session
   * GET /auth/session
   * Skip throttling for session validation endpoint
   */
  @Get('session')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  async getSession(@Request() req) {
    return {
      user: req.user,
    };
  }

  /**
   * Exchange a refresh token for a fresh access + refresh pair.
   * Public (the access token is expired by the time this is called).
   * POST /auth/refresh
   */
  @Post('refresh')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: { refreshToken: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refreshSession(body?.refreshToken);
  }

  /**
   * Logout
   * POST /auth/logout
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Request() req,
    @Body() body?: { refreshToken?: string; allDevices?: boolean },
  ): Promise<{ message: string }> {
    return this.authService.logout(req.user.id, {
      refreshToken: body?.refreshToken,
      allDevices: body?.allDevices,
    });
  }
}
