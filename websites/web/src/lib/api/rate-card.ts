import { apiBase, withInternal } from "@/lib/api/internal";
import { BUYER_PROCESSING_FEE, BUYER_PROCESSING_FEE_CAP, PLANS, planIncludes, platformFeeFrom, type Plan, type PlanRow } from "@/lib/site";

/**
 * The live rate card (A9, D10, T10): each plan's price, platform fee, limits
 * and features straight from plan_configs, plus the buyer's processing fee,
 * via the backend's `GET /config/plan-fees`, so /pricing always shows what is
 * actually charged and enforced. Public, no auth. Only plans both the API
 * (sellable) and site.ts list are shown. Falls back to the static copy in
 * site.ts if the API is unreachable (e.g. at build time).
 */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

export interface RateCard {
  plans: Plan[];
  buyerFee: number;
  /** Most the buyer fee can be per ticket, in rupees; null = no cap. */
  buyerFeeCap: number | null;
  /** "2 Nov 2026" until the platform fee starts (copy says "from ..."), then null. */
  feeFrom: string | null;
}

interface PlanFeesResponse {
  buyerProcessingFeePercent: number;
  buyerProcessingFeeCapPerTicket?: number | null;
  plans: (PlanRow & { plan: string; platformFeePercent: number; monthlyPrice: number | null; annualPrice: number | null })[];
}

export async function getRateCard(): Promise<RateCard> {
  try {
    const res = await fetch(`${API_URL}/config/plan-fees`, withInternal({ next: { revalidate: 300 } }));
    if (!res.ok) throw new Error(`plan-fees ${res.status}`);
    const data = (await res.json()) as PlanFeesResponse;
    const rows = new Map(data.plans.map((r) => [r.plan.toLowerCase(), r]));
    const feeFrom = platformFeeFrom();
    const listed = PLANS.filter((p) => rows.has(p.id));
    const plans = listed.map((p, i): Plan => {
      const row = rows.get(p.id)!;
      const fee = Number(row.platformFeePercent);
      const prev = listed[i - 1];
      return {
        ...p,
        // Rates sit at 0 until an admin sets them on go-live day (D10); until
        // then show the announced rate, worded "from <date>".
        fee: fee > 0 || !feeFrom ? fee : p.fee,
        price: row.monthlyPrice,
        annualMonthly: row.annualPrice === null ? null : Math.round(row.annualPrice / 12),
        includes: planIncludes(p, row, prev && { plan: prev, row: rows.get(prev.id)! }),
      };
    });
    return {
      plans: plans.length ? plans : PLANS,
      buyerFee: Number(data.buyerProcessingFeePercent),
      buyerFeeCap: Number(data.buyerProcessingFeeCapPerTicket) || null,
      feeFrom,
    };
  } catch {
    return { plans: PLANS, buyerFee: BUYER_PROCESSING_FEE, buyerFeeCap: BUYER_PROCESSING_FEE_CAP, feeFrom: platformFeeFrom() };
  }
}
