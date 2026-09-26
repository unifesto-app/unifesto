/**
 * Rupee formatting for operator money screens. Amounts arrive as numbers or as
 * Prisma Decimal strings ("1499.00"), so everything goes through Number().
 * Whole rupees drop the paise; anything else keeps two places.
 */
export function inr(value: number | string | null | undefined): string {
  const n = Number(value ?? 0) || 0;
  const whole = Math.abs(n % 1) < 0.005;
  const body = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${n < 0 ? '−' : ''}₹${body}`;
}

/** Compact form for tight tiles: ₹950, ₹12.4K, ₹3.2L, ₹1.1Cr (Indian units). */
export function inrShort(value: number | string | null | undefined): string {
  const n = Number(value ?? 0) || 0;
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '');
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return inr(n);
}
