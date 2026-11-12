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
