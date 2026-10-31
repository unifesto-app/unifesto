import { apiBase, withInternal } from "@/lib/api/internal";
import { BUYER_PROCESSING_FEE, BUYER_PROCESSING_FEE_CAP, PLANS, planIncludes, type Catalog, type Plan, type PlanRow } from "@/lib/site";

/**
 * The live rate card (A9, D10, T10, Z2): each plan's platform fee, limits
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
  /** Every feature, grouped, from the backend (empty if the API is unreachable). */
  catalog: Catalog;
}

interface PlanFeesResponse {
  buyerProcessingFeePercent: number;
  buyerProcessingFeeCapPerTicket?: number | null;
  plans: (PlanRow & { plan: string; tagline?: string; platformFeePercent: number })[];
  catalog?: Catalog;
}

export async function getRateCard(): Promise<RateCard> {
  try {
    const res = await fetch(`${API_URL}/config/plan-fees`, withInternal({ next: { revalidate: 300 } }));
    if (!res.ok) throw new Error(`plan-fees ${res.status}`);
    const data = (await res.json()) as PlanFeesResponse;
    const rows = new Map(data.plans.map((r) => [r.plan.toLowerCase(), r]));
    const listed = PLANS.filter((p) => rows.has(p.id));
    const plans = listed.map((p, i): Plan => {
      const row = rows.get(p.id)!;
      const prev = listed[i - 1];
      return {
        ...p,
        forWho: row.tagline ?? p.forWho,
        row,
        fee: Number(row.platformFeePercent),
        // Older APIs send fees and prices only: keep the static list then.
        includes: "eventsPerMonth" in row ? planIncludes(p, row, prev && { plan: prev, row: rows.get(prev.id)! }) : p.includes,
      };
    });
    return {
      plans: plans.length ? plans : PLANS,
      buyerFee: Number(data.buyerProcessingFeePercent),
      buyerFeeCap: Number(data.buyerProcessingFeeCapPerTicket) || null,
      catalog: data.catalog ?? [],
    };
  } catch {
    return { plans: PLANS, buyerFee: BUYER_PROCESSING_FEE, buyerFeeCap: BUYER_PROCESSING_FEE_CAP, catalog: [] };
  }
}
