import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import * as jwt from 'jsonwebtoken';

/**
 * Verifies the Unifesto access token (minted by AuthService after any login
 * flow) and attaches the user to the request. Cognito ID tokens are only
 * exchanged at POST /auth/cognito; they are never accepted as a bearer token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No authorization header');
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    try {
      const user = await this.authService.validateAccessToken(token);
      request.user = user;
      // The linked device this request comes from (absent on older tokens).
      const sid = (jwt.decode(token) as { sid?: unknown } | null)?.sid;
      request.sessionId = typeof sid === 'string' ? sid : undefined;
      this.authService.touchLastSeen(user);
      return true;
    } catch (error) {
      this.logger.warn('JWT verification failed', {
        errorMessage: error.message,
      });
      // Preserve specific messages (revoked, suspended, ...).
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
