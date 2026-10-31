/**
 * Subscriptions / billing API — space surface.
 *
 * Billing is per-Space (the P0.2 pivot): a Space is on a plan (General,
 * Club, Growth, Pro or Enterprise), priced by its platform fee per paid ticket
 * (Z2). Space Admins view their own Space's plan here; only a platform admin
 * moves a Space between plans, in Apex. Backed by the NestJS `/subscription/space/:spaceId`
 * endpoints, each gated by `@Can(space:manage-billing)`.
 *
 * Note: `amount` is a Decimal and arrives as a string — coerce with Number()
 * before maths.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type OrgPlan = "STARTER" | "CLUB" | "GROWTH" | "PRO" | "ENTERPRISE";
export type BillingCycle = "MONTHLY" | "ANNUAL";
export type SubscriptionStatus = "ACTIVE" | "GRACE" | "EXPIRED";

export interface Subscription {
  id: string | null;
  /** Present on legacy per-user rows; null once fully space-keyed. */
  userId?: string | null;
  spaceId?: string | null;
  /** False when the Space has no arrangement set up yet. */
  configured?: boolean;
  plan: OrgPlan | null;
  billingCycle: BillingCycle;
  amount: string | number;
  currency: string;
  isActive: boolean;
  /** From the dates: GRACE = 7 days after expiry, EXPIRED = General (STARTER) limits. */
  status?: SubscriptionStatus;
  /** A paid downgrade that starts when this period ends. */
  pendingPlan?: OrgPlan | null;
  pendingBillingCycle?: BillingCycle | null;
  startedAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
  nextPaymentAt: string | null;
  eventsThisMonth: number;
  usageResetAt: string;
  createdAt: string;
  updatedAt: string;
  history?: {
    id: string;
    fromPlan: OrgPlan;
    toPlan: OrgPlan;
    reason: string | null;
    changedAt: string;
  }[];
}

export interface PlanInfo {
  plan: OrgPlan;
  /** Who the plan is for, one line. */
  tagline?: string;
  spaces: number | null;
  eventsPerMonth: number | null;
  attendeesPerEvent: number | null;
  ticketTypes: number | null;
  coCurators: number | null;
  hasWaitlist: boolean;
  hasBulkExport: boolean;
  hasAnalytics: boolean;
  hasWhatsappBlast: boolean;
  hasRecurringEvents: boolean;
  hasRemoveBranding: boolean;
  hasPrioritySupport: boolean;
  hasSessions: boolean;
  hasLeaderboard: boolean;
  hasCertificates: boolean;
  hasSponsors: boolean;
  /** Organiser platform fee % per paid ticket on this plan (A9). */
  platformFeePercent: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

export interface SubscriptionUsage {
  spacesCount: number;
  eventsThisMonth: number;
  plan: OrgPlan;
  limits: {
    spaces: number | null;
    eventsPerMonth: number | null;
    attendeesPerEvent: number | null;
    ticketTypes: number | null;
    coCurators: number | null;
  };
  /**
   * Effective feature flags for this space, computed by the backend from the
   * SAME check its endpoints enforce with. Gate UI controls (e.g. bulk export)
   * on these rather than inferring from `plan`, so the control never disagrees
   * with the endpoint (a lapsed plan gets General's flags).
   */
  features: {
    hasWaitlist: boolean;
    hasBulkExport: boolean;
    hasAnalytics: boolean;
    hasWhatsappBlast: boolean;
    hasRecurringEvents: boolean;
    hasRemoveBranding: boolean;
    hasPrioritySupport: boolean;
    hasSessions: boolean;
    hasLeaderboard: boolean;
    hasCertificates: boolean;
  };
}

type Result<T> = { data: T | null; error: ApiError | null };

/* ------------------------------- Space ------------------------------- */

/** `GET /subscription/space/:spaceId` — this Space's arrangement. */
export async function getSpaceSubscription(
  spaceId: string
): Promise<Result<Subscription>> {
  return apiCall<Subscription>(
    backendClient.get(`/subscription/space/${spaceId}`)
  );
}

/** `GET /subscription/space/:spaceId/usage` — usage vs the plan's limits. */
export async function getSpaceUsage(
  spaceId: string
): Promise<Result<SubscriptionUsage>> {
  return apiCall<SubscriptionUsage>(
    backendClient.get(`/subscription/space/${spaceId}/usage`)
  );
}

export type PlanLimitKey = "spaces" | "eventsPerMonth" | "attendeesPerEvent" | "ticketTypes" | "coCurators";
export type PlanFeatureFlag = {
  [K in keyof PlanInfo]-?: PlanInfo[K] extends boolean ? K : never;
}[keyof PlanInfo];

/** One comparison line: a feature switch, a per-plan limit, or neither (every plan). */
export interface CatalogRow {
  label: string;
  flag?: PlanFeatureFlag;
  limit?: PlanLimitKey;
}

export interface PlanCatalog {
  plans: PlanInfo[];
  /** Every feature, grouped, as the backend defines it (one list for every plan page). */
  catalog: { group: string; rows: CatalogRow[] }[];
  buyerProcessingFeePercent: number;
  buyerProcessingFeeCapPerTicket: number | null;
}

/** `GET /config/plan-fees` — every plan plus the full feature catalog. */
export async function getPlanCatalog(): Promise<Result<PlanCatalog>> {
  return apiCall<PlanCatalog>(backendClient.get("/config/plan-fees"));
}

/* ------------------------------- Display --------------------------------- */

export const PLAN_LABEL: Record<OrgPlan, string> = {
  STARTER: "General",
  CLUB: "Club",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

/** Ladder order, for sorting the catalogue. */
export const PLAN_ORDER: OrgPlan[] = ["STARTER", "CLUB", "GROWTH", "PRO", "ENTERPRISE"];
