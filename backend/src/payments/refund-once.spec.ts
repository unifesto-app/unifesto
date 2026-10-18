import { refundOnce } from './payments.service';

/** A14: a refund is sent at most once per key, even after a lost response. */
describe('refundOnce', () => {
  const rzp = (items: any[] = []) => {
    const refund = jest.fn(async () => ({ id: 'rfnd_new' }));
    const fetchMultipleRefund = jest.fn(async () => ({ items }));
    return { razorpay: { payments: { refund, fetchMultipleRefund } } as any, refund, fetchMultipleRefund };
  };

  it('returns the refund already sent under the key instead of refunding again', async () => {
    const { razorpay, refund } = rzp([{ id: 'rfnd_old', amount: 5000, status: 'processed', notes: { refundKey: 'k' } }]);
    await expect(refundOnce(razorpay, 'pay_1', 50, 'k')).resolves.toBe('rfnd_old');
    expect(refund).not.toHaveBeenCalled();
  });

  it('sends a new refund carrying the key in its notes', async () => {
    const { razorpay, refund } = rzp([{ id: 'rfnd_x', amount: 5000, status: 'processed', notes: { refundKey: 'other' } }]);
    await expect(refundOnce(razorpay, 'pay_1', 50, 'k', { registrationId: 'r' })).resolves.toBe('rfnd_new');
    expect(refund).toHaveBeenCalledWith('pay_1', { amount: 5000, notes: { registrationId: 'r', refundKey: 'k' } });
  });

  it('retries a refund Razorpay marked failed', async () => {
    const { razorpay, refund } = rzp([{ id: 'rfnd_f', amount: 5000, status: 'failed', notes: { refundKey: 'k' } }]);
    await expect(refundOnce(razorpay, 'pay_1', 50, 'k')).resolves.toBe('rfnd_new');
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('finds the refund after a timeout, and rethrows when none went out', async () => {
    const { razorpay, refund, fetchMultipleRefund } = rzp();
    refund.mockRejectedValue(new Error('ETIMEDOUT'));
    fetchMultipleRefund
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [{ id: 'rfnd_late', amount: 5000, status: 'created', notes: { refundKey: 'k' } }] });
    await expect(refundOnce(razorpay, 'pay_1', 50, 'k')).resolves.toBe('rfnd_late');
    await expect(refundOnce(razorpay, 'pay_1', 50, 'k')).rejects.toThrow('ETIMEDOUT');
  });

  it('refuses when the keyed refund went out for a different amount', async () => {
    const { razorpay, refund } = rzp([{ id: 'rfnd_old', amount: 3000, status: 'processed', notes: { refundKey: 'k' } }]);
    await expect(refundOnce(razorpay, 'pay_1', 50, 'k')).rejects.toThrow('A refund of ₹30 (rfnd_old) already went out');
    expect(refund).not.toHaveBeenCalled();
  });
});
