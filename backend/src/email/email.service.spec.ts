import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

/**
 * Without RESEND_API_KEY the service must still construct (it's in the boot
 * graph of most modules) and sending must fail soft with null, the same
 * contract as a Resend API error.
 */
describe('EmailService without RESEND_API_KEY', () => {
  const saved = process.env.RESEND_API_KEY;
  beforeEach(() => delete process.env.RESEND_API_KEY);
  afterAll(() => {
    if (saved !== undefined) process.env.RESEND_API_KEY = saved;
  });

  const config = { get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService;

  it('constructs instead of throwing', () => {
    expect(() => new EmailService(config)).not.toThrow();
  });

  it('returns null from a send instead of calling Resend', async () => {
    const service = new EmailService(config) as unknown as {
      sendViaResend: (to: string, subject: string, html: string) => Promise<string | null>;
    };
    await expect(service.sendViaResend('a@b.co', 'Hi', '<p>Hi</p>')).resolves.toBeNull();
  });
});
