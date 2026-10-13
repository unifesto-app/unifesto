import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { PlatformConfigService } from '../subscription/platform-config.service';

describe('PaymentsService', () => {
  const KEY_SECRET = 'test_secret';
  const WEBHOOK_SECRET = 'test_webhook_secret';

  let service: PaymentsService;
  let platformConfig: { getProcessingFeePercent: jest.Mock };

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    platformConfig = { getProcessingFeePercent: jest.fn().mockReturnValue(2) };
    service = new PaymentsService(
      platformConfig as unknown as PlatformConfigService,
    );
  });

  describe('computeProcessingFee', () => {
    it('applies the admin-configured percent', () => {
      expect(service.computeProcessingFee(1000)).toBe(20); // 2% of 1000
    });

    it('rounds to the paise (S16)', () => {
      expect(service.computeProcessingFee(617.25)).toBe(12.35); // 2% = 12.345
      expect(service.computeProcessingFee(0.3)).toBe(0.01); // 2% = 0.006
    });

    it('is zero for a free base price', () => {
      expect(service.computeProcessingFee(0)).toBe(0);
    });
  });

  describe('createOrder', () => {
    it('converts rupees to paise and normalises the result', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'order_abc' });
      // Replace the Razorpay client with a stub so no network call happens.
      (service as unknown as { razorpay: unknown }).razorpay = {
        orders: { create },
      };

      const result = await service.createOrder({
        amount: 499.5,
        receipt: 'sess_1',
        notes: { sessionId: 's1' },
      });

      expect(create).toHaveBeenCalledWith({
        amount: 49950, // paise, rounded
        currency: 'INR',
        receipt: 'sess_1',
        notes: { sessionId: 's1' },
      });
      expect(result).toEqual({
        orderId: 'order_abc',
        amount: 499.5,
        currency: 'INR',
      });
    });
  });

  describe('verifyPaymentSignature', () => {
    const orderId = 'order_1';
    const paymentId = 'pay_1';
    const validSignature = () =>
      crypto
        .createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

    it('accepts a correct signature', () => {
      expect(
        service.verifyPaymentSignature(orderId, paymentId, validSignature()),
      ).toBe(true);
    });

    it('rejects a tampered signature of equal length', () => {
      const sig = validSignature();
      const tampered = sig[0] === '0' ? '1' + sig.slice(1) : '0' + sig.slice(1);
      expect(
        service.verifyPaymentSignature(orderId, paymentId, tampered),
      ).toBe(false);
    });

    it('rejects a signature of wrong length without throwing', () => {
      expect(service.verifyPaymentSignature(orderId, paymentId, 'short')).toBe(
        false,
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a correct webhook signature', () => {
      const body = JSON.stringify({ event: 'payment.captured' });
      const sig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      expect(service.verifyWebhookSignature(body, sig)).toBe(true);
    });

    it('rejects a wrong webhook signature', () => {
      const body = JSON.stringify({ event: 'payment.captured' });
      expect(service.verifyWebhookSignature(body, 'nope')).toBe(false);
    });
  });
});
