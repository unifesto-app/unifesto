import { SetMetadata } from '@nestjs/common';
import { Action } from './actions';

export const CAN_ACTION_KEY = 'can:action';
export const CAN_LOCATOR_KEY = 'can:locator';

/**
 * Where the guard should read the resource id from. Defaults follow the existing
 * route convention: SPACE actions use `params.spaceId ?? params.id`, EVENT
 * actions use `params.eventId ?? params.id`. Override when a route names the id
 * differently or carries it in the body.
 */
export interface CanLocator {
  source?: 'params' | 'body' | 'query';
  spaceKey?: string;
  eventKey?: string;
}

/**
 * Declare the action a route performs. Pair with CanGuard:
 *
 *   @UseGuards(JwtAuthGuard, CanGuard)
 *   @Can(Action.SPACE_MANAGE_BILLING)          // reads params.id / params.spaceId
 *   @Can(Action.EVENT_PUBLISH, { eventKey: 'eventId' })
 *
 * A list passes on any one of the actions (T12: D9 money is the event's
 * Curator OR the owning space's Space Admin). A SPACE action on a route that
 * carries only an eventId is checked on the event's owning space.
 */
export const Can = (action: Action | readonly Action[], locator: CanLocator = {}) => {
  return (target: any, key?: any, descriptor?: any) => {
    SetMetadata(CAN_ACTION_KEY, action)(target, key, descriptor);
    SetMetadata(CAN_LOCATOR_KEY, locator)(target, key, descriptor);
    return descriptor ?? target;
  };
};
