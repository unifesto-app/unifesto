import { CouponDiscountType } from '@prisma/client';
import { computeCouponDiscount, DiscountableCoupon } from './coupon-pricing';

const percent = (value: number, cap: number | null = null): DiscountableCoupon => ({
  discountType: CouponDiscountType.PERCENT,
  discountValue: value,
  maxDiscountAmount: cap,
  minPurchaseAmount: null,
});

const flat = (value: number): DiscountableCoupon => ({
  discountType: CouponDiscountType.FLAT,
  discountValue: value,
  maxDiscountAmount: null,
  minPurchaseAmount: null,
});

describe('computeCouponDiscount', () => {
  it('takes a straight percentage off the base', () => {
    expect(computeCouponDiscount(1000, percent(20))).toEqual({
      discount: 200,
      finalBase: 800,
    });
  });

  it('caps a percentage discount at maxDiscountAmount', () => {
    // 50% of 2000 = 1000, but capped at 300.
    expect(computeCouponDiscount(2000, percent(50, 300))).toEqual({
      discount: 300,
      finalBase: 1700,
    });
  });

  it('rounds a percentage discount to whole paise (half-up)', () => {
    // 10% of 999.99 = 99.999 -> 100.00
    expect(computeCouponDiscount(999.99, percent(10))).toEqual({
      discount: 100,
      finalBase: 899.99,
    });
  });

  it('applies a flat discount', () => {
    expect(computeCouponDiscount(1000, flat(150))).toEqual({
      discount: 150,
      finalBase: 850,
    });
  });

  it('never discounts more than the base (flat larger than price)', () => {
    expect(computeCouponDiscount(500, flat(800))).toEqual({
      discount: 500,
      finalBase: 0,
    });
  });

  it('never discounts more than the base (100% off)', () => {
    expect(computeCouponDiscount(750, percent(100))).toEqual({
      discount: 750,
      finalBase: 0,
    });
  });

  it('handles a zero base cleanly', () => {
    expect(computeCouponDiscount(0, percent(25))).toEqual({
      discount: 0,
      finalBase: 0,
    });
  });
});
