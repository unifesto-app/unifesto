import { apiBase, withInternal } from "@/lib/api/internal";
import { BUYER_PROCESSING_FEE, BUYER_PROCESSING_FEE_CAP, PLANS, type Plan } from "@/lib/site";

/**
 * The live rate card (A9, D10): each plan's platform fee and the buyer's
 * processing fee, from the backend's `GET /config/plan-fees`, so /pricing
 * always shows what is actually charged. Public, no auth. Falls back to the
 * static copy in site.ts if the API is unreachable (e.g. at build time).
 */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

export interface RateCard {
  plans: Plan[];
  buyerFee: number;
  /** Most the buyer fee can be per ticket, in rupees; null = no cap. */
  buyerFeeCap: number | null;
}

interface PlanFeesResponse {
  buyerProcessingFeePercent: number;
  buyerProcessingFeeCapPerTicket?: number | null;
  plans: { plan: string; platformFeePercent: number }[];
}

export async function getRateCard(): Promise<RateCard> {
  try {
    const res = await fetch(`${API_URL}/config/plan-fees`, withInternal({ next: { revalidate: 300 } }));
    if (!res.ok) throw new Error(`plan-fees ${res.status}`);
    const data = (await res.json()) as PlanFeesResponse;
    const fee = new Map(data.plans.map((p) => [p.plan.toLowerCase(), Number(p.platformFeePercent)]));
    return {
      plans: PLANS.map((p) => (fee.has(p.id) ? { ...p, fee: fee.get(p.id)! } : p)),
      buyerFee: Number(data.buyerProcessingFeePercent),
      buyerFeeCap: Number(data.buyerProcessingFeeCapPerTicket) || null,
    };
  } catch {
    return { plans: PLANS, buyerFee: BUYER_PROCESSING_FEE, buyerFeeCap: BUYER_PROCESSING_FEE_CAP };
  }
}
