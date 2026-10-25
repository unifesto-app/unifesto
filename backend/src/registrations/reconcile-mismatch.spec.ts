import { Prisma } from '@prisma/client';
import { RegistrationPaymentsService } from './registration-payments.service';

/**
 * T6: a forced amount-mismatched reconcile books what was captured, and the
 * delta lands on the organiser's base, never on the buyer fee.
 */
describe('forced reconcile books the captured amount', () => {
  const run = async (capturedPaise: number) => {
    const update = jest.fn(async () => ({}));
    const svc = new (RegistrationPaymentsService as any)({ eventRegistration: { update } });
    const reg = {
      id: 'r1',
      razorpayAmount: new Prisma.Decimal(1050),
      totalAmount: new Prisma.Decimal(1050),
      processingFee: new Prisma.Decimal(50),
    };
    await svc.matchReconcileAmount(reg, { id: 'pay_1', amount: capturedPaise }, { allowAmountMismatch: true });
    const d = (update.mock.calls[0] as any)[0].data;
    return [Number(d.razorpayAmount), Number(d.totalAmount), Number(d.processingFee)];
  };

  it('over-capture raises the base, not our fee', async () => {
    expect(await run(110000)).toEqual([1100, 1100, 50]);
  });

  it('short capture lowers the total and the base', async () => {
    expect(await run(80000)).toEqual([800, 800, 50]);
  });

  it('the fee only shrinks once the base is gone', async () => {
    expect(await run(3000)).toEqual([30, 30, 30]);
  });
});
