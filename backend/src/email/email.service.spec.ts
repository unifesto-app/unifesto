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

describe('EmailService brandFor', () => {
  const config = { get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService;
  const space = {
    slug: 'acme', subscription: { plan: 'PRO' }, name: 'Acme', logoUrl: null,
    whiteLabelEnabled: true, brandingSuspendedAt: null, brandColor: '#123456', brandLogoUrl: null,
    brandFont: null, brandMode: null, hidePoweredBy: false, faviconUrl: null,
    emailFromName: null, emailReplyTo: 'hi@acme.edu',
    domains: [
      { kind: 'EMAIL', hostname: 'mail.acme.edu', emailLocalPart: 'tickets' },
      { kind: 'WEB', hostname: 'events.acme.edu', emailLocalPart: null },
    ],
  };
  const build = (has: boolean) =>
    new EmailService(
      config,
      { event: { findUnique: async () => ({ whiteLabelEnabled: false, brandColor: null, space }) } } as any,
      { getEffectiveLimits: () => ({ hasRemoveBranding: has }) } as any,
    ) as unknown as { brandFor: (id?: string) => Promise<any> };

  it('brands and sends from the verified domain when the plan allows', async () => {
    const r = await build(true).brandFor('e1');
    expect(r.brand).toMatchObject({ name: 'Acme', color: '#123456', url: 'https://events.acme.edu' });
    expect(r.sender).toEqual({ fromName: 'Acme', replyTo: 'hi@acme.edu', fromAddress: 'tickets@mail.acme.edu' });
  });

  it('stays Unifesto without the plan perk or an eventId', async () => {
    expect(await build(false).brandFor('e1')).toEqual({ brand: null, sender: undefined });
    expect(await build(true).brandFor()).toEqual({ brand: null });
  });
});
