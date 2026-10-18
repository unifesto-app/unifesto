/**
 * Event coupon / discount-code API — backed by `/events/:eventId/coupons`.
 * Management routes are gated server-side by @Can(event:edit).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type CouponDiscountType = "PERCENT" | "FLAT";

export interface Coupon {
  id: string;
  eventId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  // Prisma Decimals arrive as strings over JSON; coerce with Number() in the UI.
  discountValue: number | string;
  maxDiscountAmount: number | string | null;
  minPurchaseAmount: number | string | null;
  usageLimit: number | null;
  perUserLimit: number;
  /** Confirmed redemptions + slots held mid-checkout. */
  usedCount: number;
  /** Redemptions that actually settled (subset of usedCount). */
  confirmedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  appliesToTicketTypeIds: string[];
  isActive: boolean;
  createdAt: string;
}

/** Optional fields take null to clear them on an edit. */
export interface CouponInput {
  code: string;
  description?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minPurchaseAmount?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  appliesToTicketTypeIds?: string[];
  isActive?: boolean;
}

export async function getEventCoupons(
  eventId: string
): Promise<{ data: Coupon[] | null; error: ApiError | null }> {
  return apiCall<Coupon[]>(backendClient.get(`/events/${eventId}/coupons`));
}

export async function createCoupon(
  eventId: string,
  input: CouponInput
): Promise<{ data: Coupon | null; error: ApiError | null }> {
  return apiCall<Coupon>(
    backendClient.post(`/events/${eventId}/coupons`, input)
  );
}

export async function updateCoupon(
  eventId: string,
  couponId: string,
  input: Partial<CouponInput>
): Promise<{ data: Coupon | null; error: ApiError | null }> {
  return apiCall<Coupon>(
    backendClient.patch(`/events/${eventId}/coupons/${couponId}`, input)
  );
}

export async function deleteCoupon(
  eventId: string,
  couponId: string
): Promise<{ data: { id: string } | null; error: ApiError | null }> {
  return apiCall<{ id: string }>(
    backendClient.delete(`/events/${eventId}/coupons/${couponId}`)
  );
}
