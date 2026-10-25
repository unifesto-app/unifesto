/**
 * Subscriptions / billing API — space surface.
 *
 * Billing is per-Space (the P0.2 pivot): a Space is on a plan
 * (STARTER…ENTERPRISE) billed to its accountable admin. Space Admins view and
 * change their own Space's arrangement here; the platform-admin/all-spaces
 * views live in Apex. Backed by the NestJS `/subscription/space/:spaceId`
 * endpoints, each gated by `@Can(space:manage-billing)`.
 *
 * Note: Decimal fields (`amount`, `revenueSharePercent`) arrive as strings —
 * coerce with Number() before maths.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type BillingModel = "FREE" | "REVENUE_SHARE" | "SUBSCRIPTION";
export type OrgPlan = "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";
export type BillingCycle = "MONTHLY" | "ANNUAL";
export type SubscriptionStatus = "ACTIVE" | "GRACE" | "EXPIRED";

export interface Subscription {
  id: string | null;
  /** Present on legacy per-user rows; null once fully space-keyed. */
  userId?: string | null;
  spaceId?: string | null;
  /** False when the Space has no arrangement set up yet. */
  configured?: boolean;
  billingModel: BillingModel | null;
  revenueSharePercent: string | number | null;
  plan: OrgPlan | null;
  billingCycle: BillingCycle;
  amount: string | number;
  currency: string;
  isActive: boolean;
  /** From the dates: GRACE = 7 days after expiry, EXPIRED = Starter limits. */
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
  billingModel?: "FREE" | "SUBSCRIPTION" | "REVENUE_SHARE";
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
   * with the endpoint — FREE / REVENUE_SHARE spaces draw their flags from the
   * billing-model config, not the plan table.
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
  STARTER: "Starter",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

/** High → low, for ordering the catalogue and deciding upgrade vs downgrade. */
export const PLAN_ORDER: OrgPlan[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

/** Rank of a plan (index in {@link PLAN_ORDER}); -1 if unknown. */
export function planRank(plan: OrgPlan | null | undefined): number {
  return plan ? PLAN_ORDER.indexOf(plan) : -1;
}

/** A short human description of the billing arrangement. */
export function billingSummary(s: Subscription): string {
  if (s.configured === false || !s.billingModel) return "No arrangement set";
  switch (s.billingModel) {
    case "FREE":
      return "Free — no platform fee";
    case "REVENUE_SHARE": {
      const pct = s.revenueSharePercent ?? 0;
      return `${Number(pct)}% of event sales`;
    }
    case "SUBSCRIPTION": {
      const amt = Number(s.amount) || 0;
      const cycle = s.billingCycle === "ANNUAL" ? "yr" : "mo";
      const planLabel = s.plan ? PLAN_LABEL[s.plan] : "Custom";
      return amt > 0
        ? `${planLabel} · ₹${amt.toLocaleString("en-IN")}/${cycle}`
        : planLabel;
    }
    default:
      return "—";
  }
}

/** The price for a plan on a given cycle (₹, or null when not purchasable). */
export function priceFor(plan: PlanInfo, cycle: BillingCycle): number | null {
  return cycle === "MONTHLY" ? plan.monthlyPrice : plan.annualPrice;
}
