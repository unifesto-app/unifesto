import { settle, settleRow } from './settle';

/** T6: one settlement rule for every money surface, at each sale's frozen fee. */
describe('settle', () => {
  const row = (paymentStatus: string, totalAmount: number, processingFee: number, refundedAmount = 0, platformFeePercent: number | null = null) =>
    ({ paymentStatus, totalAmount, processingFee, refundedAmount, platformFeePercent });

  it('nets buyer fees, refunds and each sale\'s own organiser fee', () => {
    const s = settle(
      [
        row('PAID', 1050, 50, 0, 2.5), // a deal sale: 1000 x 2.5% = 25
        row('PARTIALLY_REFUNDED', 525, 25, 200), // today's 10%: 300 x 10% = 30
        row('REFUNDED', 105, 5, 100), // buyer fee kept, base returned
        row('PENDING', 210, 10),
        row('FAILED', 210, 10),
      ],
      10,
    );
    expect(s).toEqual({
      collected: 1680,
      buyerFees: 80,
      refunded: 300,
      gross: 1300,
      platformFee: 55,
      net: 1245,
      pending: 210,
      paidCount: 1,
    });
  });

  it('a row awaiting its automatic refund is not the organiser\'s', () => {
    expect(settleRow({ ...row('PAID', 105, 5), refundDueAt: new Date() }, 10)).toMatchObject({ collected: 105, base: 0, net: 0 });
  });

  it('settles groupBy sums like rows (one rounding per rate)', () => {
    const rows = [row('PAID', 33.33, 0, 0, 10), row('PAID', 33.33, 0, 0, 10), row('PAID', 33.34, 0, 0, 10)];
    expect(settle(rows, 0).platformFee).toBe(10);
    expect(settle([row('PAID', 100, 0, 0, 10)], 0).platformFee).toBe(10);
  });
});
