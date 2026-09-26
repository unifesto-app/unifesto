import { CouponDiscountType } from '@prisma/client';

/**
 * The coupon fields the discount math needs. A subset of EventCoupon so this
 * stays a pure function testable without a database row.
 */
export interface DiscountableCoupon {
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minPurchaseAmount: number | null;
}

export interface DiscountResult {
  /** Money taken off the base amount, rounded to 2 decimals, >= 0. */
  discount: number;
  /** baseAmount - discount, never below 0. */
  finalBase: number;
}

/** Round a rupee amount to whole paise (2 decimals), half-up. */
function toPaise(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the discount a coupon takes off a base ticket amount.
 *
 * POLICY (v1 — tell me if you want it different):
 *   - PERCENT: discount = base * value/100, then capped by maxDiscountAmount.
 *   - FLAT:    discount = min(value, base) — a flat code never pays the buyer.
 *   - Both are rounded to whole paise (half-up) and clamped so finalBase >= 0.
 *   - minPurchaseAmount is a *gate*, checked by the caller before this runs; a
 *     base below the floor should never reach here. This function assumes the
 *     coupon already qualifies and only does the arithmetic.
 *
 * Kept pure (no Prisma, no I/O) so the money rules can be unit-tested in
 * isolation and reused by both the buyer-facing quote and the checkout path.
 */
export function computeCouponDiscount(
  baseAmount: number,
  coupon: DiscountableCoupon,
): DiscountResult {
  let discount: number;

  if (coupon.discountType === CouponDiscountType.PERCENT) {
    discount = toPaise((baseAmount * coupon.discountValue) / 100);
    if (coupon.maxDiscountAmount != null) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
  } else {
    discount = coupon.discountValue;
  }

  // Never discount more than the base — a coupon zeroes the ticket at most, it
  // never turns into a credit the buyer walks away with.
  discount = toPaise(Math.max(0, Math.min(discount, baseAmount)));

  return { discount, finalBase: toPaise(baseAmount - discount) };
}
