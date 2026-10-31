import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Ip,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AppleLoginDto,
  EmailLoginDto,
  SendMobileOtpDto,
  VerifyMobileDto,
  AuthResponseDto,
  CognitoLoginDto,
  VerifyEmailOtpDto,
  RefreshTokenDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login with Apple
   * POST /auth/apple
   */
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async loginWithApple(
    @Body() dto: AppleLoginDto,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.loginWithApple(dto, ua);
  }

  /**
   * Send Email OTP
   * POST /auth/email
   */
  @Post('cognito')
  async loginWithCognito(
    @Body() body: CognitoLoginDto,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.loginWithCognito(body.idToken, ua);
  }

  @Post('email')
  // Per-IP coarse limit. Kept generous because a whole campus can share one NAT
  // public IP during an event; real abuse protection is the per-identifier and
  // per-IP OTP counters in OtpService.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async loginWithEmail(
    @Body() dto: EmailLoginDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    return this.authService.loginWithEmail(dto, ip);
  }

  /**
   * Verify Email OTP
   * POST /auth/email/verify
   */
  @Post('email/verify')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(
    @Body() body: VerifyEmailOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.verifyEmailOtp(body.email, body.otp, ip, ua);
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
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    return this.authService.sendMobileOtp(dto, ip);
  }

  /**
   * Verify Mobile Number
   * POST /auth/verify-mobile
   */
  @Post('verify-mobile')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyMobile(
    @Body() dto: VerifyMobileDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.verifyMobile(dto, ip, ua);
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
    @Body() body: RefreshTokenDto,
    @Headers('user-agent') ua?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refreshSession(body?.refreshToken, ua);
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
      accessToken: req.headers?.authorization?.replace(/^Bearer\s+/i, ''),
    });
  }

  /**
   * Sign out everywhere: revokes every access and refresh token of the caller.
   * POST /auth/logout-all
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Request() req): Promise<{ message: string }> {
    return this.authService.logout(req.user.id, { allDevices: true });
  }

  /**
   * My linked devices: every phone and browser signed in to my account.
   * GET /auth/sessions
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(@Request() req) {
    return this.authService.listSessions(req.user.id, req.sessionId);
  }

  /**
   * Sign one device out, and stop its pushes.
   * DELETE /auth/sessions/:id
   */
  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.authService.revokeSession(req.user.id, id);
  }

  /**
   * QR sign-in, the browser: a code to show, valid for two minutes.
   * POST /auth/qr
   */
  @Post('qr')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  startQrLink(@Headers('user-agent') ua?: string) {
    return this.authService.startQrLink(ua);
  }

  /**
   * The browser checks every 2 seconds until a phone approves (410 once expired).
   * POST /auth/qr/poll
   */
  @Post('qr/poll')
  @Throttle({ default: { limit: 90, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  pollQrLink(@Body() body?: { code?: string; secret?: string }) {
    return this.authService.pollQrLink(body?.code, body?.secret);
  }

  /**
   * The phone, before I approve: which browser is asking.
   * GET /auth/qr/:code
   */
  @Get('qr/:code')
  @UseGuards(JwtAuthGuard)
  previewQrLink(@Param('code') code: string) {
    return this.authService.previewQrLink(code);
  }

  /**
   * The phone approves: that browser is signed in as me.
   * POST /auth/qr/:code/approve
   */
  @Post('qr/:code/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  approveQrLink(@Request() req, @Param('code') code: string) {
    return this.authService.approveQrLink(req.user.id, code);
  }
}
