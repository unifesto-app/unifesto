import { paymentMethods, toPaymentMethods } from './razorpay-methods';

/** Q40: the payment page lists only what our Razorpay account takes. */
describe('Razorpay payment methods', () => {
  it('lists banks by name and only the wallets switched on', () => {
    expect(
      toPaymentMethods({
        netbanking: { YESB: 'Yes Bank', AUBL: 'AU Small Finance Bank' },
        wallet: { phonepe: true, olamoney: false, newwallet: true },
      }),
    ).toEqual({
      netbanking: [
        { code: 'AUBL', name: 'AU Small Finance Bank' },
        { code: 'YESB', name: 'Yes Bank' },
      ],
      wallets: [
        { code: 'phonepe', name: 'PhonePe' },
        { code: 'newwallet', name: 'newwallet' },
      ],
    });
  });

  it('serves the last good list while Razorpay is down', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const ok = { ok: true, json: async () => ({ netbanking: { YESB: 'Yes Bank' }, wallet: {} }) } as Response;
    const t = Date.now();

    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(paymentMethods(t)).resolves.toEqual({ netbanking: [], wallets: [] });
    // Within the retry minute: no second call.
    await paymentMethods(t + 30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(ok);
    await expect(paymentMethods(t + 2 * 60_000)).resolves.toEqual({ netbanking: [{ code: 'YESB', name: 'Yes Bank' }], wallets: [] });

    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(paymentMethods(t + 20 * 60_000)).resolves.toEqual({ netbanking: [{ code: 'YESB', name: 'Yes Bank' }], wallets: [] });
    fetchMock.mockRestore();
  });
});
