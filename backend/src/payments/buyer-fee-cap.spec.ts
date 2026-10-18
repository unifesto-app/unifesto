import { PaymentsService } from './payments.service';
import { ticketsIn } from '../registrations/registration.util';
import { addSeatsQuote } from '../registrations/team-changes.service';
import { GroupPricingMode } from '@prisma/client';

/** A34 (D11): buyer fee = min(5% of the base, ₹99 per ticket). */
describe('buyer fee cap (A34)', () => {
  const payments = new PaymentsService({
    getProcessingFeePercent: () => 5,
    getProcessingFeeCapPerTicket: () => 99,
  } as any);
  const fee = (base: number, tickets?: number) => payments.computeProcessingFee(base, tickets);

  it('is a straight 5% up to a ₹1,980 ticket', () => {
    expect(fee(500)).toBe(25);
    expect(fee(1980)).toBe(99);
  });

  it('caps at ₹99 for one pricier ticket', () => {
    expect(fee(3000)).toBe(99);
  });

  it('caps per ticket, not per order', () => {
    expect(fee(3 * 3000, 3)).toBe(297); // three ₹3,000 tickets
    expect(fee(3 * 500, 3)).toBe(75); // under the cap, still 5%
  });

  it('treats a missing or zero ticket count as one', () => {
    expect(fee(5000, 0)).toBe(99);
  });

  it('counts tickets: per-person seats, a flat group as one, else the quantity', () => {
    const perPerson = { kind: 'GROUP', groupPricingMode: 'PER_PERSON' };
    const flat = { kind: 'GROUP', groupPricingMode: 'FLAT' };
    const single = { kind: 'INDIVIDUAL', groupPricingMode: null };
    expect(ticketsIn(perPerson, { groupSize: 4 })).toBe(4);
    expect(ticketsIn(flat, { groupSize: 4 })).toBe(1);
    expect(ticketsIn(single, { quantity: 2 })).toBe(2);
    expect(ticketsIn(single, {})).toBe(1);
  });

  it('extra seats on a per-person group are capped per seat', () => {
    const quote = addSeatsQuote({ price: 2500, groupPricingMode: GroupPricingMode.PER_PERSON }, 2, fee);
    expect(quote).toEqual({ base: 5000, fee: 198, total: 5198 });
  });
});
