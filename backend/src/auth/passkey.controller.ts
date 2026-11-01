import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasskeyService } from './passkey.service';

@Controller('auth/passkeys')
export class PasskeyController {
  constructor(private readonly passkeys: PasskeyService) {}

  /**
   * My passkeys.
   * GET /auth/passkeys
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Request() req) {
    return this.passkeys.list(req.user.id);
  }

  /**
   * Adding a passkey: what my device is asked to create.
   * POST /auth/passkeys/register/options
   */
  @Post('register/options')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  registrationOptions(@Request() req) {
    return this.passkeys.registrationOptions(req.user.id);
  }

  /**
   * Adding a passkey: my device's answer.
   * POST /auth/passkeys/register
   */
  @Post('register')
  @UseGuards(JwtAuthGuard)
  register(@Request() req, @Body() body: RegistrationResponseJSON, @Headers('user-agent') ua?: string) {
    return this.passkeys.register(req.user.id, body, ua);
  }

  /**
   * DELETE /auth/passkeys/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.passkeys.remove(req.user.id, id);
  }

  /**
   * Signing in with a passkey: a challenge for any of them. The web asks on
   * every sign-in page load (autofill), so this is roomier than the codes.
   * POST /auth/passkeys/sign-in/options
   */
  @Post('sign-in/options')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  signInOptions() {
    return this.passkeys.signInOptions();
  }

  /**
   * POST /auth/passkeys/sign-in
   */
  @Post('sign-in')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  signIn(@Body() body: AuthenticationResponseJSON, @Headers('user-agent') ua?: string) {
    return this.passkeys.signIn(body, ua);
  }
}
