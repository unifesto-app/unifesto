/** The buyer fee, percent of the ticket price, capped per ticket (A34, D11).
    Matches PROCESSING_FEE_PERCENT / _CAP_PER_TICKET in the backend. */
export const BUYER_FEE_PERCENT = 4;
export const BUYER_FEE_CAP = 99;

/** What reaches the organiser from a `price` ticket when they include the fee in it (A33). */
export const includedFeeKeeps = (price: number) =>
  price - Math.min(Math.round((price * BUYER_FEE_PERCENT * 100) / (100 + BUYER_FEE_PERCENT)) / 100, BUYER_FEE_CAP);

/**
 * ₹ amount for display. Whole rupees stay whole ("₹500"); anything with paise
 * always shows two places ("₹30,166.50", never "₹30,166.5").
 */
export function inr(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  const paise = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: paise ? 2 : 0,
  })}`;
}
