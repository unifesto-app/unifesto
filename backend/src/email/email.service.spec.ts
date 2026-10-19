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

  it('returns a non-retryable failure instead of calling Resend', async () => {
    const service = new EmailService(config) as unknown as {
      sendViaResend: (to: string, subject: string, html: string) => Promise<unknown>;
    };
    await expect(service.sendViaResend('a@b.co', 'Hi', '<p>Hi</p>')).resolves.toEqual({ id: null, error: 'not_configured' });
  });

  it('sendRawEmail returns null when nothing was sent', async () => {
    await expect(new EmailService(config).sendRawEmail('a@b.co', 'Hi', '<p>Hi</p>')).resolves.toBeNull();
  });

  it('sendRawEmailTracked reports a dedup skip as ok (nothing sent twice)', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const prisma: any = {
      messageDelivery: {
        create: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }), // already SENT
      },
    };
    const service = new EmailService(config, prisma) as any;
    service.sendViaResend = jest.fn();
    const res = await service.sendRawEmailTracked('a@b.co', 'Hi', '<p>Hi</p>', undefined, { dedupKey: 'k:email' });
    expect(res).toEqual({ ok: true, id: null, deduped: true });
    expect(service.sendViaResend).not.toHaveBeenCalled();
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

describe('EmailService confirmation .ics', () => {
  const config = { get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService;
  const data = {
    email: 'a@b.co', eventId: 'e1', eventSlug: 'fest', eventTitle: 'Fest',
    eventStartDateTime: new Date('2026-11-01T10:00:00Z'), eventEndDateTime: new Date('2026-11-01T12:00:00Z'),
    eventTimezone: 'Asia/Kolkata',
  } as any;

  const icsFor = async (brand: unknown) => {
    const service = new EmailService(config) as any;
    service.brandFor = async () => ({ brand });
    let attachments: { content: Buffer }[] | undefined;
    service.deliver = async (_via: string, _to: string, _email: unknown, opts: any) => {
      attachments = opts.attachments;
      return true;
    };
    await service.sendRegistrationConfirmation(data);
    return attachments![0].content.toString('utf8').replace(/\r\n /g, '');
  };

  it("links to the space's custom web domain when branded", async () => {
    const brand = { name: 'Acme', logoUrl: null, color: null, hidePoweredBy: false, url: 'https://events.acme.edu', webBase: 'https://events.acme.edu' };
    expect(await icsFor(brand)).toContain('https://events.acme.edu/event/fest');
  });

  it('links to Unifesto when unbranded', async () => {
    const ics = await icsFor(null);
    expect(ics).toContain('/event/fest');
    expect(ics).not.toContain('acme');
  });
});
