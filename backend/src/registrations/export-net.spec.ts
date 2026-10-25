import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service';
import { buildRegistrationsService } from './registrations.testing';

jest.mock('./form-answers.policy', () => ({
  enforceFormAnswers: jest.fn(async () => undefined),
}));

/** S16: the transactions export's Net uses the payout fee rule, so it sums to netEntitlement. */
describe('transactions export Net', () => {
  it('takes the revenue-share cut and nets out partial refunds and pending auto-refunds', async () => {
    const base = {
      user: { fullName: 'A', identities: [{ email: 'a@x.in' }] },
      ticketType: { name: 'GA' },
      status: RegistrationStatus.REGISTERED,
      totalAmount: 102,
      processingFee: 2,
      refundedAmount: 0,
      paymentId: 'pay',
      orderId: 'order',
      paidAt: null,
      refundDueAt: null,
    };
    const prisma: any = {
      event: {
        findUnique: jest.fn(async () => ({
          id: 'event-1',
          title: 'Fest',
          slug: 'fest',
          spaceId: 'space-1',
          space: { subscription: { plan: 'STARTER' } },
        })),
      },
      userRole: { count: jest.fn(async () => 1) },
      eventRegistration: {
        findMany: jest.fn(async () => [
          { ...base, paymentStatus: PaymentStatus.PAID },
          { ...base, paymentStatus: PaymentStatus.PARTIALLY_REFUNDED, refundedAmount: 40 },
          { ...base, paymentStatus: PaymentStatus.PAID, refundDueAt: new Date() },
        ]),
      },
    };
    const planConfig = {
      getEffectiveLimits: jest.fn(() => ({ hasBulkExport: true })),
      resolvePlatformFeePercent: jest.fn(() => 5),
    };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, {} as any, planConfig as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { can: async () => true } as any,
    );
    const file = await svc.exportRegistrations('user-1', 'event-1', 'csv', 'transactions');
    let csv = '';
    for await (const chunk of file.stream as AsyncIterable<string | Buffer>) csv += chunk;
    const lines = csv.replace('\uFEFF', '').trim().split(/\r?\n/);
    const header = lines[0].split(',');
    const net = header.findIndex((h) => h.includes('Net'));
    const cut = header.findIndex((h) => h.includes('Platform Fee'));
    const cells = lines.slice(1).map((l) => l.split(','));
    expect(cells.map((c) => c[cut])).toEqual(['5.00', '3.00', '0.00']);
    expect(cells.map((c) => c[net])).toEqual(['95.00', '57.00', '0.00']); // sums to 152, the payout eventNet
  });
});
