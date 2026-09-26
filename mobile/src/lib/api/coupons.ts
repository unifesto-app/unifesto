import { call } from './manageEvent';

/*
 * Event discount codes (event:edit). Discounts come off the ticket's base
 * price only. `usedCount` includes slots held mid-checkout; `confirmedCount`
 * is what actually settled.
 */

export type DiscountType = 'PERCENT' | 'FLAT';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  /** Decimals arrive as strings. */
  discountValue: number | string;
  maxDiscountAmount: number | string | null;
  minPurchaseAmount: number | string | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  confirmedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  appliesToTicketTypeIds: string[];
  isActive: boolean;
}

export interface CouponInput {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
  minPurchaseAmount?: number;
  usageLimit?: number;
  perUserLimit?: number;
  startsAt?: string;
  expiresAt?: string;
  appliesToTicketTypeIds?: string[];
  isActive?: boolean;
}

export const getCoupons = (eventId: string) => call<Coupon[]>(`/events/${eventId}/coupons`);
export const createCoupon = (eventId: string, body: CouponInput) =>
  call<Coupon>(`/events/${eventId}/coupons`, { method: 'POST', body: JSON.stringify(body) });
export const updateCoupon = (eventId: string, id: string, body: Partial<CouponInput>) =>
  call<Coupon>(`/events/${eventId}/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteCoupon = (eventId: string, id: string) => call<unknown>(`/events/${eventId}/coupons/${id}`, { method: 'DELETE' });

/** "20% off (up to ₹500)" or "₹200 off". */
export function describeDiscount(c: Pick<Coupon, 'discountType' | 'discountValue' | 'maxDiscountAmount'>) {
  const v = Number(c.discountValue);
  if (c.discountType === 'FLAT') return `₹${v.toLocaleString('en-IN')} off`;
  const cap = c.maxDiscountAmount != null ? ` (up to ₹${Number(c.maxDiscountAmount).toLocaleString('en-IN')})` : '';
  return `${v}% off${cap}`;
}
