/**
 * Subscriptions / billing API.
 *
 * Every organiser has one billing arrangement (`OrgSubscription`) with a
 * `billingModel`:
 *   - FREE           → onboarded free, no platform fee
 *   - REVENUE_SHARE  → platform takes `revenueSharePercent`% of event sales
 *   - SUBSCRIPTION   → a recurring plan (STARTER…ENTERPRISE)
 *
 * Admins set the arrangement; organisers view theirs. Backed by the NestJS
 * `/subscription` controller. Note: Decimal fields (`amount`,
 * `revenueSharePercent`) arrive as strings — coerce with Number() before maths.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type BillingModel = "FREE" | "REVENUE_SHARE" | "SUBSCRIPTION";
export type OrgPlan = "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";

/** Plans a space can be put on. GROWTH is retired (D10): shown only for spaces still on it. */
export const SELLABLE_PLANS: OrgPlan[] = ["STARTER", "PRO", "ENTERPRISE"];
export type BillingCycle = "MONTHLY" | "ANNUAL";

export interface SubscriptionUser {
  id: string;
  fullName: string | null;
  username: string | null;
  mobileNumber?: string | null;
  identities?: { email: string | null }[];
}

/** The billing-arrangement fields shared by the user- and space-keyed views. */
export interface BillingArrangement {
  /** False when there is no space-keyed arrangement set up yet. */
  configured?: boolean;
  billingModel: BillingModel | null;
  revenueSharePercent: string | number | null;
  plan: OrgPlan | null;
  billingCycle: BillingCycle;
  amount: string | number;
}

export interface Subscription extends BillingArrangement {
  id: string | null;
  userId: string;
  currency: string;
  isActive: boolean;
  startedAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
  nextPaymentAt: string | null;
  eventsThisMonth: number;
  usageResetAt: string;
  createdAt: string;
  updatedAt: string;
  user?: SubscriptionUser;
  history?: {
    id: string;
    fromPlan: OrgPlan;
    toPlan: OrgPlan;
    reason: string | null;
    changedAt: string;
  }[];
}

/** The space a billing arrangement is attached to. */
export interface SubscriptionSpace {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  status?: string;
}

/**
 * Space-keyed billing arrangement (P2.1). The Space is the billing subject; the
 * `admin` is the space's accountable payer (`Space.createdBy`). `inherited` is
 * true while a space still shows its creator's legacy row (pre-P2.2 backfill) —
 * editing it writes a real space-keyed row.
 */
export interface SpaceSubscription extends BillingArrangement {
  id: string | null;
  spaceId: string;
  /** True when the shown arrangement is the creator's legacy row, not the space's own. */
  inherited?: boolean;
  currency: string;
  isActive: boolean;
  /** From the dates: GRACE = 7 days after expiry, EXPIRED = Starter limits. */
  status?: "ACTIVE" | "GRACE" | "EXPIRED" | null;
  pendingPlan?: OrgPlan | null;
  lastPaymentAt?: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  nextPaymentAt: string | null;
  eventsThisMonth: number;
  usageResetAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  space: SubscriptionSpace;
  admin: SubscriptionUser | null;
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
  /** Gates the whole Sessions feature for organisers on this plan. */
  hasSessions: boolean;
  /** Gates the competitive dashboard / leaderboard for organisers on this plan. */
  hasLeaderboard: boolean;
  /** Gates the certificate system for organisers on this plan. */
  hasCertificates: boolean;
  /** Gates the sponsors & lead-generation feature for organisers on this plan. */
  hasSponsors: boolean;
  /** Organiser platform fee % per paid ticket on this plan; new sales only (A9). */
  platformFeePercent: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

export interface BillingStats {
  total: number;
  free: number;
  revenueShare: number;
  subscription: number;
  notConfigured: number;
  active: number;
  mrr: number;
}

export interface SubscriptionsResponse {
  data: Subscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SpaceSubscriptionsResponse {
  data: SpaceSubscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUpdateSubscriptionInput {
  billingModel?: BillingModel;
  revenueSharePercent?: number;
  plan?: OrgPlan;
  billingCycle?: BillingCycle;
  amount?: number;
  isActive?: boolean;
  expiresAt?: string | null;
  reason?: string;
}

export interface ListSubscriptionsParams {
  billingModel?: BillingModel;
  plan?: OrgPlan;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

type Result<T> = { data: T | null; error: ApiError | null };

/**
 * Negotiated terms for a space or one of its events (T4). Null fields fall back
 * to the rate card: the space's plan, its organiser fee from Plans (D10) and the
 * 5% / ₹99-per-ticket buyer fee (D11). Ending a deal keeps it on record.
 */
export interface Deal {
  id: string;
  spaceId: string;
  eventId: string | null;
  event?: { id: string; title: string } | null;
  plan: OrgPlan | null;
  /** Paise; null = rate card, 0 = comp. */
  planPricePaise: number | null;
  billingCycle: BillingCycle | null;
  buyerFeeBps: number | null;
  organiserFeeBps: number | null;
  validFrom: string;
  validUntil: string | null;
  note: string | null;
  createdAt: string;
}

/** The terms a space's sales are priced under right now. */
export interface ResolvedTerms {
  dealId: string | null;
  plan: OrgPlan;
  buyerFeeBps: number;
  buyerFeeCapPaise: number;
  organiserFeeBps: number;
}

export type CreateDealInput = Partial<
  Pick<
    Deal,
    | "eventId"
    | "plan"
    | "planPricePaise"
    | "billingCycle"
    | "buyerFeeBps"
    | "organiserFeeBps"
    | "validFrom"
    | "validUntil"
    | "note"
  >
>;

/** `GET /subscription/admin/space/:spaceId/deals` — deals + terms in force. */
export async function getSpaceDeals(
  spaceId: string
): Promise<Result<{ deals: Deal[]; current: ResolvedTerms }>> {
  return apiCall(backendClient.get(`/subscription/admin/space/${spaceId}/deals`));
}

/** `POST /subscription/admin/space/:spaceId/deals` — create a deal (admin). */
export async function createSpaceDeal(
  spaceId: string,
  input: CreateDealInput
): Promise<Result<Deal>> {
  return apiCall<Deal>(
    backendClient.post(`/subscription/admin/space/${spaceId}/deals`, input)
  );
}

/** `POST /subscription/admin/deals/:dealId/end` — end a deal now (admin). */
export async function endDeal(dealId: string): Promise<Result<Deal>> {
  return apiCall<Deal>(backendClient.post(`/subscription/admin/deals/${dealId}/end`));
}

/** `GET /subscription/plans` — plan catalogue with limits + pricing. */
export async function getAllPlans(): Promise<Result<PlanInfo[]>> {
  return apiCall<PlanInfo[]>(backendClient.get("/subscription/plans"));
}

/** App-wide platform settings (admin). */
export interface PlatformConfig {
  processingFeePercent: number;
  /** Most the buyer fee can be per ticket, in rupees (A34). */
  processingFeeCapPerTicket?: number;
  /**
   * Days after an event ends that organisers may still issue certificates and
   * import/add attendees. 0 closes those actions the moment the event ends.
   */
  postEventActionWindowDays: number;
  /** Fixed App Review test login allowed. Store review only. */
  appReviewLoginEnabled: boolean;
  /** Z11: self-registration needs an 18+ confirmation. */
  requireAgeConfirmation: boolean;
}

/** `GET /admin/platform-config` — read app-wide settings (admin). */
export async function getPlatformConfig(): Promise<Result<PlatformConfig>> {
  return apiCall<PlatformConfig>(backendClient.get("/admin/platform-config"));
}

/**
 * `PATCH /admin/platform-config` — update app-wide settings (admin). Each field
 * is optional; only the ones present are applied. Returns the full config.
 */
export async function updatePlatformConfig(
  patch: Partial<PlatformConfig>
): Promise<Result<PlatformConfig>> {
  return apiCall<PlatformConfig>(
    backendClient.patch("/admin/platform-config", patch)
  );
}

/** Editable fields of a plan definition (everything except the plan key). */
export type UpdatePlanInput = Partial<Omit<PlanInfo, "plan">>;

/** `PATCH /subscription/admin/plans/:plan` — edit a plan definition (admin). */
export async function updatePlan(
  plan: OrgPlan,
  patch: UpdatePlanInput
): Promise<Result<PlanInfo>> {
  return apiCall<PlanInfo>(
    backendClient.patch(`/subscription/admin/plans/${plan}`, patch)
  );
}

/** Definition of a non-subscription billing model (Free / Revenue-share). */
export interface BillingModelConfig {
  billingModel: Extract<BillingModel, "FREE" | "REVENUE_SHARE">;
  defaultRevenueSharePercent: number | null;
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
  /** Gates the whole Sessions feature for organisers on this plan. */
  hasSessions: boolean;
  /** Gates the competitive dashboard / leaderboard for organisers on this plan. */
  hasLeaderboard: boolean;
  /** Gates the certificate system for organisers on this plan. */
  hasCertificates: boolean;
  /** Gates the sponsors & lead-generation feature for organisers on this plan. */
  hasSponsors: boolean;
}

export type UpdateModelInput = Partial<
  Omit<BillingModelConfig, "billingModel">
>;

/** `GET /subscription/models` — Free & Revenue-share definitions. */
export async function getBillingModels(): Promise<
  Result<BillingModelConfig[]>
> {
  return apiCall<BillingModelConfig[]>(backendClient.get("/subscription/models"));
}

/** `PATCH /subscription/admin/models/:model` — edit Free / Revenue-share. */
export async function updateModel(
  model: "FREE" | "REVENUE_SHARE",
  patch: UpdateModelInput
): Promise<Result<BillingModelConfig>> {
  return apiCall<BillingModelConfig>(
    backendClient.patch(`/subscription/admin/models/${model}`, patch)
  );
}

/** `POST /subscription/cancel` — cancel and drop to STARTER. */
export async function cancelSubscription(): Promise<Result<Subscription>> {
  return apiCall<Subscription>(backendClient.post("/subscription/cancel"));
}

/* --------------------------------- Admin --------------------------------- */

/** `GET /subscription/admin/all` — every organiser's arrangement (filterable). */
export async function listSubscriptions(
  params: ListSubscriptionsParams = {}
): Promise<Result<SubscriptionsResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiCall<SubscriptionsResponse>(
    backendClient.get(`/subscription/admin/all${qs ? `?${qs}` : ""}`)
  );
}

/** `GET /subscription/admin/stats` — billing overview counts + MRR. */
export async function getBillingStats(): Promise<Result<BillingStats>> {
  return apiCall<BillingStats>(backendClient.get("/subscription/admin/stats"));
}

/** `PATCH /subscription/admin/:userId` — set an organiser's arrangement. */
export async function adminUpdateSubscription(
  userId: string,
  input: AdminUpdateSubscriptionInput
): Promise<Result<Subscription>> {
  return apiCall<Subscription>(
    backendClient.patch(`/subscription/admin/${userId}`, input)
  );
}

/* ---------------------------- Admin (per space) --------------------------- */

/** `GET /subscription/admin/spaces` — every space's arrangement (filterable). */
export async function listSpaceSubscriptions(
  params: ListSubscriptionsParams = {}
): Promise<Result<SpaceSubscriptionsResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiCall<SpaceSubscriptionsResponse>(
    backendClient.get(`/subscription/admin/spaces${qs ? `?${qs}` : ""}`)
  );
}

/** `GET /subscription/admin/spaces/stats` — space-driven overview + MRR. */
export async function getSpaceBillingStats(): Promise<Result<BillingStats>> {
  return apiCall<BillingStats>(
    backendClient.get("/subscription/admin/spaces/stats")
  );
}

/** `PATCH /subscription/admin/space/:spaceId` — set a space's arrangement. */
export async function adminUpdateSpaceSubscription(
  spaceId: string,
  input: AdminUpdateSubscriptionInput
): Promise<Result<SpaceSubscription>> {
  return apiCall<SpaceSubscription>(
    backendClient.patch(`/subscription/admin/space/${spaceId}`, input)
  );
}

export interface OfflinePaymentInput {
  plan: OrgPlan;
  billingCycle: BillingCycle;
  /** ₹ received. */
  amount: number;
  /** Bank / cheque reference; a reference is recorded once. */
  reference?: string;
  note?: string;
}

/** `POST /subscription/admin/space/:spaceId/offline-payment` — extends the period. */
export async function recordOfflinePayment(
  spaceId: string,
  input: OfflinePaymentInput
): Promise<Result<SpaceSubscription>> {
  return apiCall<SpaceSubscription>(
    backendClient.post(`/subscription/admin/space/${spaceId}/offline-payment`, input)
  );
}

/* ------------------------------- Display --------------------------------- */

export const BILLING_MODEL_LABEL: Record<BillingModel, string> = {
  FREE: "Free",
  REVENUE_SHARE: "Revenue share",
  SUBSCRIPTION: "Subscription",
};

export const PLAN_LABEL: Record<OrgPlan, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
};

export function subscriberName(s: Subscription): string {
  return s.user?.fullName || s.user?.username || "Unknown organiser";
}

export function subscriberEmail(s: Subscription): string | null {
  return s.user?.identities?.[0]?.email || null;
}

/** A space's display name for the billing list. */
export function spaceSubName(s: SpaceSubscription): string {
  return s.space?.name || s.space?.slug || "Untitled space";
}

/** The accountable admin's email for a space's billing arrangement. */
export function spaceAdminEmail(s: SpaceSubscription): string | null {
  return s.admin?.identities?.[0]?.email || null;
}

/** The accountable admin's display name for a space's billing arrangement. */
export function spaceAdminName(s: SpaceSubscription): string | null {
  return s.admin?.fullName || s.admin?.username || null;
}

/** A short human description of the billing arrangement. */
export function billingSummary(s: BillingArrangement): string {
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
