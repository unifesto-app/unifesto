/**
 * Subscriptions / billing API.
 *
 * Every space is on one plan (`OrgSubscription`): General (STARTER), Club,
 * Growth, Pro or Enterprise. Custom terms for a space live in deals. Backed by
 * the NestJS `/subscription` controller. Note: `amount` is a Decimal and
 * arrives as a string — coerce with Number() before maths.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type OrgPlan = "STARTER" | "CLUB" | "GROWTH" | "PRO" | "ENTERPRISE";

/** Every plan, in ladder order. */
export const SELLABLE_PLANS: OrgPlan[] = ["STARTER", "CLUB", "GROWTH", "PRO", "ENTERPRISE"];
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
  plan: OrgPlan | null;
  billingCycle: BillingCycle;
  amount: string | number;
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
  /** From the dates: GRACE = 7 days after expiry, EXPIRED = General (STARTER) limits. */
  status?: "ACTIVE" | "GRACE" | "EXPIRED" | null;
  pendingPlan?: OrgPlan | null;
  lastPaymentAt?: string | null;
  /** Set when cancelled at period end; the plan runs until expiresAt. */
  cancelledAt?: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  nextPaymentAt: string | null;
  eventsThisMonth: number;
  usageResetAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  space: SubscriptionSpace;
  admin: SubscriptionUser | null;
  /** The current plan's price now (T6): the space deal's, else the rate card's. */
  priceInForce?: PlanPrice | null;
}

/** A plan price and the deal it comes from (T6). */
export interface PlanPrice {
  /** Paise; null = no set price (contact sales), 0 = comp. */
  pricePaise: number | null;
  /** Null = rate card. */
  dealId: string | null;
}

/** "₹1,499/mo · deal" style label for a price in force. */
export function planPriceLabel(p: PlanPrice | null | undefined, cycle: BillingCycle): string {
  if (!p || p.pricePaise === null) return "No set price";
  if (p.pricePaise === 0) return "Comp (deal)";
  const rupees = (p.pricePaise / 100).toLocaleString("en-IN");
  return `₹${rupees}/${cycle === "ANNUAL" ? "yr" : "mo"} · ${p.dealId ? "deal" : "rate card"}`;
}

export interface PlanInfo {
  plan: OrgPlan;
  /** Who the plan is for, one line (rate card only). */
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
  hasRemoveBranding: boolean;
  hasPrioritySupport: boolean;
  /** Gates the whole Sessions feature for organisers on this plan. */
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
  /** Spaces on each plan. */
  byPlan: Record<OrgPlan, number>;
  /** Spaces on a paid plan with a live payment behind it (comps excluded). */
  paying: number;
  notConfigured: number;
  active: number;
  mrr: number;
}

export interface SpaceSubscriptionsResponse {
  data: SpaceSubscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUpdateSubscriptionInput {
  plan?: OrgPlan;
  billingCycle?: BillingCycle;
  amount?: number;
  isActive?: boolean;
  expiresAt?: string | null;
  reason?: string;
}

export interface ListSubscriptionsParams {
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
  /** H20: spaces may add their own email sending domain. */
  customSendingDomainsEnabled: boolean;
  /** Every AI feature the backend knows (read-only). */
  aiFeatures?: string[];
  /** The AI features allowed to run; the rest are off. */
  aiEnabledFeatures?: string[];
}

/** `GET /admin/platform-config` — read app-wide settings (admin). */
export async function getPlatformConfig(): Promise<Result<PlatformConfig>> {
  return apiCall<PlatformConfig>(backendClient.get("/admin/platform-config"));
}

/** One AI feature's calls over the last 30 days. */
export interface AiUsage {
  runs: number;
  ok: number;
  refused: number;
  error: number;
  costUsd: number;
  /** Share of prompt tokens read from cache, 0 to 1. */
  cacheShare: number;
  avgLatencyMs: number;
}

/** `GET /admin/ai-usage` — each AI feature's last 30 days, keyed by feature (admin). */
export async function getAiUsage(): Promise<Result<Record<string, AiUsage>>> {
  return apiCall<Record<string, AiUsage>>(backendClient.get("/admin/ai-usage"));
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
  /** ₹ received; omitted = the plan's price in force. */
  amount?: number;
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

/** `GET /subscription/admin/space/:spaceId/plan-prices` — each paid plan's price now. */
export async function getSpacePlanPrices(
  spaceId: string
): Promise<Result<Partial<Record<OrgPlan, Record<BillingCycle, PlanPrice>>>>> {
  return apiCall(backendClient.get(`/subscription/admin/space/${spaceId}/plan-prices`));
}

/* ------------------------------- Display --------------------------------- */

export const PLAN_LABEL: Record<OrgPlan, string> = {
  STARTER: "General",
  CLUB: "Club",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
};

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

/** "Pro · ₹2,999/mo" style label for a space's plan. */
export function billingSummary(s: BillingArrangement): string {
  if (s.configured === false || !s.plan) return "No plan set";
  const amt = Number(s.amount) || 0;
  const cycle = s.billingCycle === "ANNUAL" ? "yr" : "mo";
  return amt > 0 ? `${PLAN_LABEL[s.plan]} · ₹${amt.toLocaleString("en-IN")}/${cycle}` : PLAN_LABEL[s.plan];
}
