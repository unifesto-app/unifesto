/**
 * Admin Analytics API — platform mission-control numbers.
 * Backed by `GET /admin/analytics/overview`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export interface AnalyticsOverview {
  users: { total: number; newLast30Days: number };
  spaces: { total: number; active: number; pendingRequests: number };
  events: { total: number; published: number };
  registrations: { total: number };
  revenue: { totalPaid: number };
  // Ops overview additions (present on newer backends; optional for safety).
  push?: {
    sentLast30Days: number;
    failedLast30Days: number;
    deliveryRatePercent: number | null;
  };
  generatedAt: string;
}

export async function getAnalyticsOverview(): Promise<{
  data: AnalyticsOverview | null;
  error: ApiError | null;
}> {
  return apiCall<AnalyticsOverview>(
    backendClient.get("/admin/analytics/overview")
  );
}

/** One month of the financial time-series. Amounts are in ₹, cash-flow dated. */
export interface FinancialMonth {
  /** "YYYY-MM" bucket key (Asia/Kolkata calendar month). */
  period: string;
  /** Display label, e.g. "Aug 2026". */
  label: string;
  /** Gross ever paid this month, incl. the app processing fee. */
  collected: number;
  /** Organiser ticket revenue (collected − processing fee). */
  ticketRevenue: number;
  /** App processing fee the platform kept. */
  processingFees: number;
  /** Cash returned by refunds on sales made this month (accrual dating). */
  refunded: number;
  /** ticketRevenue − refunded (cash-accurate net for the month). */
  netRevenue: number;
  /** Payouts completed (settled to organisers) this month. */
  settled: number;
  /** Count of paid/refunded registrations created this month. */
  registrations: number;
}

export interface FinancialTimeseries {
  months: FinancialMonth[];
  generatedAt: string;
}

/**
 * Range keys shared by every analytics chart. Granularity follows the range:
 * `today` → hourly, `7d`/`1m` → daily, `6m`/`12m`/`24m` → monthly.
 */
export type AnalyticsRange = "today" | "7d" | "1m" | "6m" | "12m" | "24m";

/** Financial time-series. `GET /admin/analytics/financial-timeseries`. */
export async function getFinancialTimeseries(
  range: AnalyticsRange = "12m"
): Promise<{ data: FinancialTimeseries | null; error: ApiError | null }> {
  return apiCall<FinancialTimeseries>(
    backendClient.get("/admin/analytics/financial-timeseries", {
      params: { range },
    })
  );
}

/** One month of the user / space / event growth series. Counts, not amounts. */
export interface GrowthMonth {
  /** "YYYY-MM" bucket key (Asia/Kolkata calendar month). */
  period: string;
  /** Display label, e.g. "Aug 2026". */
  label: string;
  /** Accounts created this month. */
  newUsers: number;
  /** Total accounts at month end (running platform total). */
  cumulativeUsers: number;
  /** Spaces created this month. */
  newSpaces: number;
  /** Total spaces at month end. */
  cumulativeSpaces: number;
  /** Events created this month. */
  newEvents: number;
  /** Of this month's events, how many are currently published. */
  publishedEvents: number;
  /** Total events at month end. */
  cumulativeEvents: number;
  /** Registrations placed this month (all payment states). */
  newRegistrations: number;
}

/** A single slice of a status-distribution donut. */
export interface StatusSlice {
  status: string;
  count: number;
}

export interface GrowthTimeseries {
  months: GrowthMonth[];
  eventsByStatus: StatusSlice[];
  spacesByStatus: StatusSlice[];
  generatedAt: string;
}

/** Growth time-series. `GET /admin/analytics/growth-timeseries`. */
export async function getGrowthTimeseries(
  range: AnalyticsRange = "12m"
): Promise<{ data: GrowthTimeseries | null; error: ApiError | null }> {
  return apiCall<GrowthTimeseries>(
    backendClient.get("/admin/analytics/growth-timeseries", {
      params: { range },
    })
  );
}

/** This week vs the week before. */
export interface WoW {
  current: number;
  previous: number;
}
export interface WoWRow extends WoW {
  /** Referrer domain / campaign / utm_source; null = direct or untagged. */
  key: string | null;
}

/** Z7 weekly scorecard: last 7 IST days (today included) vs the 7 before. */
export interface WeeklyScorecard {
  generatedAt: string;
  weeks: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  web: { pageViews: WoW; visits: WoW; referrers: WoWRow[]; campaigns: WoWRow[] };
  upcomingEvents: WoW;
  activeOrganisers: WoW;
  registrations: { total: WoW; bySource: WoWRow[] };
  money: { gmv: WoW; platformFees: WoW };
  support: { open: number; pending: number; oldestOpenDays: number | null };
}

/** `GET /admin/analytics/weekly-scorecard`. */
export async function getWeeklyScorecard(): Promise<{
  data: WeeklyScorecard | null;
  error: ApiError | null;
}> {
  return apiCall<WeeklyScorecard>(
    backendClient.get("/admin/analytics/weekly-scorecard")
  );
}
