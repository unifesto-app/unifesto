import { RoleCode } from '@prisma/client';
import { Action } from './actions';

/**
 * The capability matrix: the actions each role grants *directly at its own
 * scope*. Cross-scope inheritance (a Space Admin acting on an event inside their
 * space, a Platform Admin acting anywhere) is NOT encoded here — it is a policy
 * decision resolved in authorization.service.ts. Keep this table about direct
 * grants only, so "what a Curator can do to their own event" reads in one place.
 *
 * Derived from docs/plan.md §1 role table:
 *   Space Admin — plan/billing, members, money, creates events
 *   Curator     — owns one event end-to-end (publish/cancel/money included)
 *   Co-Curator  — helps run an event; NO publish/cancel, NO money
 *   Crew        — check-in / scanning only
 */
export const CAPABILITIES: Partial<Record<RoleCode, ReadonlyArray<Action>>> = {
  // Platform Admin's power is modelled as an inheritance rule (superuser), not a
  // finite list — see authorization.service.ts. Left out of the matrix on
  // purpose so nobody has to keep it in sync with every new Action.

  // Platform-scoped team member: works the Company section and Product board in
  // Apex. company:view-restricted is off by default; platform:manage and
  // company:manage can never be granted (see EMPLOYEE_NEVER_GRANTABLE).
  [RoleCode.EMPLOYEE]: [
    Action.COMPANY_VIEW,
    Action.COMPANY_EDIT,
    Action.PRODUCT_VIEW,
    Action.PRODUCT_EDIT,
  ],

  [RoleCode.SPACE_ADMIN]: [
    Action.SPACE_VIEW,
    Action.SPACE_MANAGE_BILLING,
    Action.SPACE_MANAGE_MEMBERS,
    Action.SPACE_MANAGE_MONEY,
    Action.SPACE_MANAGE_SETTINGS,
    Action.SPACE_CREATE_EVENT,
    Action.SPACE_MANAGE_EMAIL,
    Action.SPACE_MANAGE_SPONSORS,
  ],

  [RoleCode.CURATOR]: [
    Action.EVENT_VIEW,
    Action.EVENT_EDIT,
    Action.EVENT_PUBLISH,
    Action.EVENT_CANCEL,
    Action.EVENT_MANAGE_MONEY,
    Action.EVENT_ASSIGN_CREW,
    Action.EVENT_CHECK_IN,
    Action.EVENT_MANAGE_ATTENDEES,
    Action.EVENT_MANAGE_LEADERBOARD,
    // Declaring and publishing hackathon winners is the Curator's call
    // (Space Admins inherit it; Co-Curators don't have it).
    Action.EVENT_DECLARE_HACKATHON_WINNERS,
    // Curators run their events end-to-end, including outbound email to their
    // audiences (space:manage-email is a SPACE-scoped action, resolved against
    // the space the curator holds a role in).
    Action.SPACE_MANAGE_EMAIL,
    // Curators run sponsors + lead capture for their events (SPACE-scoped,
    // resolved against the space the curator holds a role in).
    Action.SPACE_MANAGE_SPONSORS,
    Action.EVENT_MANAGE_SUPPORT,
  ],

  [RoleCode.CO_CURATOR]: [
    Action.EVENT_VIEW,
    Action.EVENT_EDIT,
    Action.EVENT_ASSIGN_CREW,
    Action.EVENT_CHECK_IN,
    Action.EVENT_MANAGE_ATTENDEES,
    Action.EVENT_MANAGE_LEADERBOARD,
    Action.EVENT_MANAGE_SUPPORT,
    // deliberately NO publish / cancel / manage-money
  ],

  [RoleCode.CREW]: [Action.EVENT_VIEW, Action.EVENT_CHECK_IN],

  // MEMBER and JUDGE grant no operator actions here (JUDGE is scored in the
  // leaderboard module; MEMBER is space membership without operator power).
};
