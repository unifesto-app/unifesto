import { ReconciliationService } from './reconciliation.service';

/**
 * Unit tests for `getOrphanedPayments` — the classifier behind the Orphaned
 * Payments admin view. It starts from Razorpay's captured payments and decides,
 * for each, whether the money is already settled (drop it), stuck on a still
 * PENDING registration (UNSETTLED — reconcile in place), or belongs to a
 * registration that no longer exists (ORPHANED — re-home onto a suggested live
 * pending ticket). No real DB or Razorpay — the two collaborators are mocked.
 */
describe('ReconciliationService.getOrphanedPayments', () => {
  const now = Date.now();

  /** A Razorpay `listPayments` row (only the fields the classifier reads). */
  const pay = (over: Partial<Record<string, unknown>>) => ({
    id: 'pay_x',
    orderId: 'order_x',
    status: 'captured',
    amount: 20580,
    amountRefunded: 0,
    method: 'upi',
    email: 'a@a.com',
    contact: '+910000000000',
    createdAt: now,
    notes: {},
    ...over,
  });

  const payments = {
    listPayments: jest.fn(async () => [
      // Orphan with a re-home target (same user/event/amount pending reg exists).
      pay({ id: 'pay_orph', amount: 20580, notes: { registrationId: 'gone-1', eventId: 'E1', userId: 'U1' } }),
      // Missed webhook — notes registration still exists, just PENDING.
      pay({ id: 'pay_unset', amount: 10000, notes: { registrationId: 'exists-1', eventId: 'E2', userId: 'U2' } }),
      // Already attributed to a paid registration → must be dropped.
      pay({ id: 'pay_settled', amount: 5000, notes: { registrationId: 'settled-1' } }),
      // Refunded → not money we should attach → filtered out before classifying.
      pay({ id: 'pay_ref', amount: 5000, amountRefunded: 100, notes: { registrationId: 'x' } }),
      // Orphan with NO matching pending reg → unresolved (needs manual target).
      pay({ id: 'pay_orph2', amount: 7777, notes: { registrationId: 'gone-2', eventId: 'E9', userId: 'U9' } }),
    ]),
    fetchOrderNotes: jest.fn(async () => ({})),
  };

  const prisma = {
    eventRegistration: {
      findMany: jest.fn(({ where }: any) => {
        if (where.paymentId) return [{ paymentId: 'pay_settled' }]; // attributed
        if (where.id) return [{ id: 'exists-1' }]; // which notes-regs still exist
        if (where.userId) {
          // Suggest pool: one live pending reg for U1 that matches on amount.
          return [
            {
              id: 'R-target',
              userId: 'U1',
              eventId: 'E1',
              razorpayAmount: 205.8, // → 20580 paise, matches pay_orph
              event: { title: 'Pitch Arena' },
              user: { fullName: 'G.Shobha reddy', username: 'shobha' },
            },
          ];
        }
        return [];
      }),
    },
    sessionRegistration: { findMany: jest.fn(async () => []) },
  };

  const build = () => new ReconciliationService(prisma as any, payments as any);

  it('classifies orphaned vs unsettled and drops settled/refunded payments', async () => {
    const { rows, counts } = await build().getOrphanedPayments();

    expect(counts).toEqual({ total: 3, orphaned: 2, unsettled: 1, unresolved: 1 });

    const ids = rows.map((r) => r.paymentId);
    expect(ids).not.toContain('pay_settled'); // already paid
    expect(ids).not.toContain('pay_ref'); // refunded

    // Orphans are listed before the unsettled row.
    expect(rows[rows.length - 1].classification).toBe('UNSETTLED');
  });

  it('suggests a same-attendee/event/amount target for a recoverable orphan', async () => {
    const { rows } = await build().getOrphanedPayments();
    const orph = rows.find((r) => r.paymentId === 'pay_orph')!;

    expect(orph.classification).toBe('ORPHANED');
    expect(orph.reassignOrphan).toBe(true);
    expect(orph.targetRegistrationId).toBe('R-target');
    expect(orph.suggestion).toMatchObject({
      registrationId: 'R-target',
      eventTitle: 'Pitch Arena',
      attendee: 'G.Shobha reddy',
    });
    expect(orph.amount).toBe(205.8); // paise → rupees
  });

  it('reconciles an unsettled payment in place (no reassign, notes reg is the target)', async () => {
    const { rows } = await build().getOrphanedPayments();
    const unset = rows.find((r) => r.paymentId === 'pay_unset')!;

    expect(unset.classification).toBe('UNSETTLED');
    expect(unset.reassignOrphan).toBe(false);
    expect(unset.targetRegistrationId).toBe('exists-1');
  });

  it('marks an orphan with no matching pending reg as unresolved', async () => {
    const { rows } = await build().getOrphanedPayments();
    const orph2 = rows.find((r) => r.paymentId === 'pay_orph2')!;

    expect(orph2.classification).toBe('ORPHANED');
    expect(orph2.targetRegistrationId).toBeNull();
    expect(orph2.suggestion).toBeNull();
  });
});
