import { StayGender, StayPaymentMode, StayPricing } from '@prisma/client';
import {
  bedsLeftByNight,
  firstFullNight,
  gendersFit,
  newPassCode,
  nightKeys,
  nightsBetween,
  parseDay,
  PASS_CODE_RE,
  priceBooking,
} from './stay-rules';

const d = (s: string) => parseDay(s)!;

describe('stay rules', () => {
  describe('parseDay', () => {
    it('accepts real calendar days only', () => {
      expect(parseDay('2026-10-10')?.toISOString()).toBe(
        '2026-10-10T00:00:00.000Z',
      );
      expect(parseDay('2026-02-30')).toBeNull();
      expect(parseDay('10-10-2026')).toBeNull();
      expect(parseDay(undefined)).toBeNull();
    });
  });

  describe('nights', () => {
    it('counts nights, not days (check-out day is free)', () => {
      expect(nightsBetween(d('2026-10-10'), d('2026-10-12'))).toBe(2);
      expect(nightKeys(d('2026-10-10'), d('2026-10-12'))).toEqual([
        '2026-10-10',
        '2026-10-11',
      ]);
    });

    it('crosses month ends', () => {
      expect(nightKeys(d('2026-10-30'), d('2026-11-02'))).toEqual([
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
      ]);
    });
  });

  describe('beds per night', () => {
    const holdings = [
      // 3 guests, nights of the 10th and 11th
      {
        checkInDate: d('2026-10-10'),
        checkOutDate: d('2026-10-12'),
        guestCount: 3,
      },
      // 2 guests, night of the 11th only
      {
        checkInDate: d('2026-10-11'),
        checkOutDate: d('2026-10-12'),
        guestCount: 2,
      },
    ];

    it('subtracts every booking that covers the night', () => {
      expect(
        bedsLeftByNight(6, holdings, d('2026-10-10'), d('2026-10-13')),
      ).toEqual([
        { date: '2026-10-10', left: 3 },
        { date: '2026-10-11', left: 1 },
        { date: '2026-10-12', left: 6 },
      ]);
    });

    it('frees the bed on the check-out day', () => {
      expect(
        firstFullNight(6, holdings, d('2026-10-12'), d('2026-10-13'), 6),
      ).toBeNull();
    });

    it('reports the first night that cannot take the group', () => {
      expect(
        firstFullNight(6, holdings, d('2026-10-10'), d('2026-10-12'), 2),
      ).toBe('2026-10-11');
      expect(
        firstFullNight(6, holdings, d('2026-10-10'), d('2026-10-12'), 1),
      ).toBeNull();
    });

    it('never goes below zero when oversold', () => {
      expect(
        bedsLeftByNight(2, holdings, d('2026-10-11'), d('2026-10-12'))[0].left,
      ).toBe(0);
    });
  });

  describe('priceBooking', () => {
    const fee = (base: number) => base * 0.05;

    it('prices per guest per night', () => {
      expect(
        priceBooking({
          price: 300,
          pricing: StayPricing.PER_NIGHT,
          paymentMode: StayPaymentMode.ONLINE,
          guests: 2,
          nights: 3,
          feeFor: fee,
        }),
      ).toEqual({
        paymentMode: StayPaymentMode.ONLINE,
        baseAmount: 1800,
        processingFee: 90,
        totalAmount: 1890,
      });
    });

    it('prices per guest for the whole stay', () => {
      expect(
        priceBooking({
          price: 500,
          pricing: StayPricing.PER_STAY,
          paymentMode: StayPaymentMode.ONLINE,
          guests: 2,
          nights: 3,
          feeFor: fee,
        }).baseAmount,
      ).toBe(1000);
    });

    it('charges no fee when paid at the property', () => {
      expect(
        priceBooking({
          price: 300,
          pricing: StayPricing.PER_NIGHT,
          paymentMode: StayPaymentMode.PAY_AT_PROPERTY,
          guests: 1,
          nights: 2,
          feeFor: fee,
        }),
      ).toEqual({
        paymentMode: StayPaymentMode.PAY_AT_PROPERTY,
        baseAmount: 600,
        processingFee: 0,
        totalAmount: 600,
      });
    });

    it('a free option is FREE whatever the mode says', () => {
      expect(
        priceBooking({
          price: 0,
          pricing: StayPricing.PER_NIGHT,
          paymentMode: StayPaymentMode.ONLINE,
          guests: 4,
          nights: 2,
          feeFor: fee,
        }).paymentMode,
      ).toBe(StayPaymentMode.FREE);
    });

    it('a priced option marked FREE is collected at the property', () => {
      expect(
        priceBooking({
          price: 100,
          pricing: StayPricing.PER_STAY,
          paymentMode: StayPaymentMode.FREE,
          guests: 1,
          nights: 1,
          feeFor: fee,
        }).paymentMode,
      ).toBe(StayPaymentMode.PAY_AT_PROPERTY);
    });
  });

  it('checks gender restrictions', () => {
    expect(gendersFit(StayGender.ANY, ['MALE', 'FEMALE', 'OTHER'])).toBe(true);
    expect(gendersFit(StayGender.FEMALE, ['FEMALE', 'FEMALE'])).toBe(true);
    expect(gendersFit(StayGender.FEMALE, ['FEMALE', 'MALE'])).toBe(false);
  });

  it('makes readable, well-formed pass codes', () => {
    for (let i = 0; i < 200; i++) {
      const code = newPassCode();
      expect(code).toMatch(PASS_CODE_RE);
      expect(code).not.toMatch(/[01IO]/);
    }
  });
});
