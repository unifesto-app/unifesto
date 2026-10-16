import { RoleScope } from '@prisma/client';

/**
 * The catalogue of authorizable actions in the platform.
 *
 * Naming convention: `<scope>:<verb-noun>`. The prefix names the scope the
 * action lives at and is used by the AuthorizationService to know which
 * resource id (spaceId / eventId) it must resolve before checking capability.
 *
 * Controllers declare the action they perform via @Can(...) instead of naming
 * roles. This is the single source of truth for "what can be done"; who can do
 * it lives in capabilities.ts.
 */
export const Action = {
  // ---- Platform scope (apex.unifesto.app) ----
  PLATFORM_MANAGE: 'platform:manage', // run Unifesto: plan catalog, partnerships, ops

  // ---- Space scope (space.unifesto.app) ----
  SPACE_VIEW: 'space:view',
  SPACE_MANAGE_BILLING: 'space:manage-billing', // plan changes / payments
  SPACE_MANAGE_MEMBERS: 'space:manage-members', // invite / remove / re-role members
  SPACE_MANAGE_MONEY: 'space:manage-money', // payouts, refunds, bank account
  SPACE_MANAGE_SETTINGS: 'space:manage-settings', // profile, white-label, sub-spaces
  SPACE_CREATE_EVENT: 'space:create-event', // name-only create + assign curator
  SPACE_MANAGE_EMAIL: 'space:manage-email', // compose/send campaigns, manage templates
  SPACE_MANAGE_SPONSORS: 'space:manage-sponsors', // sponsor roster/tiers, event attach, leads

  // ---- Event scope ----
  EVENT_VIEW: 'event:view',
  EVENT_EDIT: 'event:edit', // fill in details, tickets, schedule
  EVENT_PUBLISH: 'event:publish', // publish / unpublish
  EVENT_CANCEL: 'event:cancel', // cancel the event
  EVENT_MANAGE_MONEY: 'event:manage-money', // event-level refunds / payouts
  EVENT_ASSIGN_CREW: 'event:assign-crew', // add co-curators / crew to the event
  EVENT_CHECK_IN: 'event:check-in', // scan / check attendees in
  EVENT_MANAGE_ATTENDEES: 'event:manage-attendees', // manually add / bulk-import attendees, send payment links
  EVENT_MANAGE_LEADERBOARD: 'event:manage-leaderboard', // competitive dashboard: rounds, panels, advancement, awards
  EVENT_DECLARE_HACKATHON_WINNERS: 'event:declare-hackathon-winners', // hackathon awards: declare, publish, notes
  // Work the space's Assist desk: see, reply to and escalate the event's cases.
  // Named for the space desk (decision D2) but checked at EVENT scope: Curators,
  // Co-Curators and Crew hold event roles, and the per-space IAM console only
  // toggles event actions. A Space Admin gets it by inheritance.
  SPACE_MANAGE_SUPPORT: 'space:manage-support',
} as const;

export type Action = (typeof Action)[keyof typeof Action];

/**
 * The scope an action is checked at. Drives which resource id the
 * AuthorizationService must have (or resolve) before it can answer `can()`.
 */
export const ACTION_SCOPE: Record<Action, RoleScope> = {
  [Action.PLATFORM_MANAGE]: RoleScope.PLATFORM,

  [Action.SPACE_VIEW]: RoleScope.SPACE,
  [Action.SPACE_MANAGE_BILLING]: RoleScope.SPACE,
  [Action.SPACE_MANAGE_MEMBERS]: RoleScope.SPACE,
  [Action.SPACE_MANAGE_MONEY]: RoleScope.SPACE,
  [Action.SPACE_MANAGE_SETTINGS]: RoleScope.SPACE,
  [Action.SPACE_CREATE_EVENT]: RoleScope.SPACE,
  [Action.SPACE_MANAGE_EMAIL]: RoleScope.SPACE,
  [Action.SPACE_MANAGE_SPONSORS]: RoleScope.SPACE,

  [Action.EVENT_VIEW]: RoleScope.EVENT,
  [Action.EVENT_EDIT]: RoleScope.EVENT,
  [Action.EVENT_PUBLISH]: RoleScope.EVENT,
  [Action.EVENT_CANCEL]: RoleScope.EVENT,
  [Action.EVENT_MANAGE_MONEY]: RoleScope.EVENT,
  [Action.EVENT_ASSIGN_CREW]: RoleScope.EVENT,
  [Action.EVENT_CHECK_IN]: RoleScope.EVENT,
  [Action.EVENT_MANAGE_ATTENDEES]: RoleScope.EVENT,
  [Action.EVENT_MANAGE_LEADERBOARD]: RoleScope.EVENT,
  [Action.EVENT_DECLARE_HACKATHON_WINNERS]: RoleScope.EVENT,
  [Action.SPACE_MANAGE_SUPPORT]: RoleScope.EVENT,
};

/**
 * A resource an action is performed against. The AuthorizationService needs the
 * id that matches the action's scope:
 *   - PLATFORM actions need nothing,
 *   - SPACE actions need `spaceId`,
 *   - EVENT actions need `eventId` (the owning spaceId is resolved from it).
 */
export interface AuthResource {
  spaceId?: string;
  eventId?: string;
}
