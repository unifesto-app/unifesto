import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleScope } from '@prisma/client';
import { Action, ACTION_SCOPE, AuthResource } from './actions';
import { AuthorizationService } from './authorization.service';
import { CAN_ACTION_KEY, CAN_LOCATOR_KEY, CanLocator } from './can.decorator';

/**
 * Route guard that delegates to AuthorizationService.can(). It reads the @Can()
 * action, derives the scope, locates the resource id on the request, and asks
 * the central authorizer. No role names live here — this is the single seam
 * between HTTP routing and the capability model.
 *
 * Routes with no @Can() metadata are ignored (returns true) so it is safe to add
 * globally or alongside other guards. SpaceRoleGuard has been retired in favour
 * of this; RolesGuard remains for platform-admin (@Roles(ADMIN)) routes.
 */
@Injectable()
export class CanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<Action | undefined>(
      CAN_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true; // no @Can() on this route

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('User not authenticated');

    const locator =
      this.reflector.getAllAndOverride<CanLocator>(CAN_LOCATOR_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};

    const resource = this.locateResource(request, action, locator);
    await this.authz.assertCan(user, action, resource);
    return true;
  }

  /** Pull the spaceId / eventId the action needs off the request. */
  private locateResource(
    request: any,
    action: Action,
    locator: CanLocator,
  ): AuthResource {
    const scope = ACTION_SCOPE[action];
    const bag = request[locator.source ?? 'params'] ?? {};

    if (scope === RoleScope.SPACE) {
      const key = locator.spaceKey;
      return { spaceId: key ? bag[key] : (bag.spaceId ?? bag.id) };
    }
    if (scope === RoleScope.EVENT) {
      const key = locator.eventKey;
      return { eventId: key ? bag[key] : (bag.eventId ?? bag.id) };
    }
    return {}; // PLATFORM actions need no resource id
  }
}
