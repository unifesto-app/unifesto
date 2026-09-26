import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * For public routes whose response widens for signed-in insiders (e.g. a
 * space's event list includes drafts for its operators). Attaches `req.user`
 * when a valid Bearer token is present; otherwise lets the request through
 * anonymously. Never rejects — the handler must treat a missing `req.user` as
 * the public view.
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.headers.authorization) return true;
    try {
      await super.canActivate(context);
    } catch {
      // Bad/expired token on a public route: serve the anonymous view rather
      // than a 401, so a stale cookie never breaks a public page.
      request.user = undefined;
    }
    return true;
  }
}
