/**
 * Subscriptions / billing API — space surface.
 *
 * Billing is per-Space (the P0.2 pivot): a Space is on a plan (General,
 * Club, Growth, Pro or Enterprise) billed to its accountable admin. Space
 * Admins view and change their own Space's plan here; the platform-admin/all-spaces
 * views live in Apex. Backed by the NestJS `/subscription/space/:spaceId`
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

export interface UpgradeInput {
  plan: OrgPlan;
  billingCycle: BillingCycle;
}

/** What `POST …/upgrade` returns — the Razorpay order to check out against. */
export interface UpgradeOrder {
  orderId: string;
  amount: number;
  currency: string;
  plan: OrgPlan;
  billingCycle: BillingCycle;
  /** renew extends; upgrade starts now; downgrade starts at period end. */
  kind?: "renew" | "upgrade" | "downgrade";
  /** ₹ of unused time taken off an upgrade. */
  credit?: number;
  /** Public key for the checkout modal (served by the backend, not env). */
  razorpayKeyId: string;
}

export interface VerifyUpgradeInput {
  orderId: string;
  paymentId: string;
  signature: string;
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

/** `GET /subscription/plans` — plan catalogue with limits + pricing. */
export async function getAllPlans(): Promise<Result<PlanInfo[]>> {
  return apiCall<PlanInfo[]>(backendClient.get("/subscription/plans"));
}

/**
 * `POST /subscription/space/:spaceId/upgrade` — create a Razorpay order for a
 * plan change. Returns the order to open Razorpay checkout against; the change
 * only takes effect after {@link verifySpaceUpgrade}.
 */
export async function createSpaceUpgradeOrder(
  spaceId: string,
  input: UpgradeInput
): Promise<Result<UpgradeOrder>> {
  return apiCall<UpgradeOrder>(
    backendClient.post(`/subscription/space/${spaceId}/upgrade`, input)
  );
}

/**
 * `POST /subscription/space/:spaceId/upgrade/verify` — hand back the signed
 * Razorpay result to activate the new plan.
 */
export async function verifySpaceUpgrade(
  spaceId: string,
  input: VerifyUpgradeInput
): Promise<Result<Subscription>> {
  return apiCall<Subscription>(
    backendClient.post(`/subscription/space/${spaceId}/upgrade/verify`, input)
  );
}

/** `POST /subscription/space/:spaceId/cancel` — cancel and drop to STARTER. */
export async function cancelSpaceSubscription(
  spaceId: string
): Promise<Result<Subscription>> {
  return apiCall<Subscription>(
    backendClient.post(`/subscription/space/${spaceId}/cancel`)
  );
}

/* ------------------------------- Display --------------------------------- */

export const PLAN_LABEL: Record<OrgPlan, string> = {
  STARTER: "General",
  CLUB: "Club",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

/** High → low, for ordering the catalogue and deciding upgrade vs downgrade. */
export const PLAN_ORDER: OrgPlan[] = ["STARTER", "CLUB", "GROWTH", "PRO", "ENTERPRISE"];

/** Rank of a plan (index in {@link PLAN_ORDER}); -1 if unknown. */
export function planRank(plan: OrgPlan | null | undefined): number {
  return plan ? PLAN_ORDER.indexOf(plan) : -1;
}

/** "Pro · ₹2,999/mo" style label for a space's plan. */
export function billingSummary(s: Subscription): string {
  if (s.configured === false || !s.plan) return "No plan set";
  const amt = Number(s.amount) || 0;
  const cycle = s.billingCycle === "ANNUAL" ? "yr" : "mo";
  return amt > 0 ? `${PLAN_LABEL[s.plan]} · ₹${amt.toLocaleString("en-IN")}/${cycle}` : PLAN_LABEL[s.plan];
}

/** The price for a plan on a given cycle (₹, or null when not purchasable). */
export function priceFor(plan: PlanInfo, cycle: BillingCycle): number | null {
  return cycle === "MONTHLY" ? plan.monthlyPrice : plan.annualPrice;
}
