import { quote, rateCardFees } from './quote';
import { PaymentsService } from './payments.service';

const RATE = rateCardFees({
  getProcessingFeePercent: () => 5,
  getProcessingFeeCapPerTicket: () => 99,
});

/**
 * PaymentsService.priceSale / computeProcessingFee as they were before T5,
 * verbatim, so every path's numbers can be proven unchanged.
 */
function before(listed: number, tickets = 1, absorb = false) {
  const percent = 5;
  const capPerTicket = 99;
  const paise = (n: number) => Math.round(n * 100 + 1e-9) / 100;
  const computeProcessingFee = (basePrice: number, t = 1) => {
    const fee = Math.round(basePrice * percent + 1e-9) / 100;
    const cap = capPerTicket * Math.max(1, Math.trunc(t));
    return Math.min(fee, cap);
  };
  if (!absorb) {
    const fee = computeProcessingFee(listed, tickets);
    return { base: listed, fee, total: paise(listed + fee) };
  }
  const included = paise(listed - listed / (1 + percent / 100));
  const cap = capPerTicket * Math.max(1, Math.trunc(tickets));
  const fee = Math.min(included, cap);
  return { base: paise(listed - fee), fee, total: listed };
}

describe('quote() (T5)', () => {
  it.each([
    // listed paise, tickets, absorb, coupon → base, fee, total
    [50_000, 1, false, 0, 50_000, 2_500, 52_500], // ₹500: straight 5%
    [198_000, 1, false, 0, 198_000, 9_900, 207_900], // ₹1,980: exactly the cap
    [300_000, 1, false, 0, 300_000, 9_900, 309_900], // ₹3,000: capped at ₹99
    [900_000, 3, false, 0, 900_000, 29_700, 929_700], // cap is per ticket
    [12_345, 1, false, 0, 12_345, 617, 12_962], // ₹123.45 → ₹6.1725 rounds down
    [12_350, 1, false, 0, 12_350, 618, 12_968], // ₹123.50 → ₹6.175 rounds half up
    [105_000, 1, true, 0, 100_000, 5_000, 105_000], // absorbed: buyer pays the listed price
    [500_000, 1, true, 0, 490_100, 9_900, 500_000], // absorbed fee still capped
    [100_000, 1, false, 20_000, 80_000, 4_000, 84_000], // coupon comes off the base first
    [100_000, 1, false, 150_000, 0, 0, 0], // coupon never goes below zero
    [0, 1, false, 0, 0, 0, 0],
  ])(
    '%i paise ×%i absorb=%s coupon=%i',
    (listed, tickets, absorb, coupon, base, fee, total) => {
      const q = quote(listed, RATE, {
        tickets,
        absorb,
        couponDiscountPaise: coupon,
      });
      expect([q.basePaise, q.buyerFeePaise, q.totalPaise]).toEqual([
        base,
        fee,
        total,
      ]);
    },
  );

  it('a deal fee replaces the rate, the per-ticket cap stays', () => {
    expect(quote(100_000, { ...RATE, buyerFeeBps: 300 }).buyerFeePaise).toBe(
      3_000,
    );
    expect(quote(500_000, { ...RATE, buyerFeeBps: 300 }).buyerFeePaise).toBe(
      9_900,
    );
    expect(quote(100_000, { ...RATE, buyerFeeBps: 0 }).totalPaise).toBe(
      100_000,
    );
  });

  it('shows the organiser fee on the base when the terms carry it', () => {
    expect(
      quote(100_000, { ...RATE, organiserFeeBps: 250 }).organiserFeePaise,
    ).toBe(2_500);
    expect(
      quote(105_000, { ...RATE, organiserFeeBps: 150 }, { absorb: true })
        .organiserFeePaise,
    ).toBe(1_500);
    expect(quote(100_000, RATE).organiserFeePaise).toBeNull();
  });

  /**
   * Parity: every path (main checkout, manual-add link, waitlist offer, group
   * seat add-on, sessions, stays) prices through PaymentsService.priceSale /
   * computeProcessingFee, which now call quote(). Sweep bases ₹0.01–₹5,000 in
   * odd steps, 1–5 tickets, fee on top and absorbed: identical to before.
   */
  it('matches the pre-T5 maths for every base, ticket count and absorb', () => {
    const payments = new PaymentsService({
      getProcessingFeePercent: () => 5,
      getProcessingFeeCapPerTicket: () => 99,
    } as any);
    let checked = 0;
    const diffs: string[] = [];
    for (let p = 1; p <= 500_000; p += p < 10_000 ? 1 : 37) {
      const listed = p / 100;
      for (const tickets of [1, 2, 3, 5]) {
        for (const absorb of [false, true]) {
          const a = before(listed, tickets, absorb);
          const b = payments.priceSale(listed, tickets, absorb);
          checked++;
          if (a.base !== b.base || a.fee !== b.fee || a.total !== b.total) {
            diffs.push(
              `${listed}×${tickets} absorb=${absorb}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
            );
          }
          if (
            !absorb &&
            payments.computeProcessingFee(listed, tickets) !== a.fee
          )
            diffs.push(`fee ${listed}`);
        }
      }
    }
    expect(diffs.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(100_000);
  });
});
