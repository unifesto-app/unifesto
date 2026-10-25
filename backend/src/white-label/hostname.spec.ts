import { ForbiddenException } from '@nestjs/common';
import { emailDomainCreateError, normaliseHostname, WhiteLabelService } from './white-label.service';

describe('normaliseHostname', () => {
  it('lower-cases and drops a trailing dot', () => {
    expect(normaliseHostname(' Mail.Acme.EDU. ')).toBe('mail.acme.edu');
  });
  it('rejects junk, bare words and our own domain', () => {
    for (const bad of ['acme', 'http://acme.com', 'a..b.com', '-x.acme.com', 'unifesto.app', 'mail.unifesto.app']) {
      expect(() => normaliseHostname(bad)).toThrow();
    }
  });
});

describe('emailDomainCreateError', () => {
  it('turns a Resend plan/domain-limit refusal into a clear 403', () => {
    const e = emailDomainCreateError({ name: 'validation_error', message: 'You have reached your domain limit' });
    expect(e).toBeInstanceOf(ForbiddenException);
    expect(e.message).toMatch(/coming soon/);
  });
  it('treats a *_quota_* error name as a limit refusal', () => {
    expect(emailDomainCreateError({ name: 'daily_quota_exceeded', message: 'x' })).toBeInstanceOf(ForbiddenException);
  });
  it('falls back to a generic 400 with no provider message', () => {
    const e = emailDomainCreateError(null);
    expect(e.getStatus()).toBe(400);
    expect(e.message).toBe('Could not add that domain');
  });
  it('keeps other provider messages as a 400', () => {
    const e = emailDomainCreateError({ name: 'validation_error', message: 'Invalid domain name' });
    expect(e.getStatus()).toBe(400);
    expect(e.message).toBe('Invalid domain name');
  });
});

describe('addEmailDomain (H20 platform switch)', () => {
  const build = (flag: boolean | null) => {
    const create = jest.fn(async () => ({ data: null, error: { name: 'validation_error', message: 'You have reached your domain limit' } }));
    const prisma = {
      platformConfig: { findUnique: jest.fn(async () => (flag === null ? null : { customSendingDomainsEnabled: flag })) },
      space: { findUnique: jest.fn(async () => ({ subscription: {} })) },
      spaceDomain: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    };
    const planConfig = { getEffectiveLimits: () => ({ hasRemoveBranding: true }) };
    const config = { get: (_k: string, d?: string) => d };
    const svc = new WhiteLabelService(prisma as never, planConfig as never, {} as never, {} as never, config as never);
    (svc as unknown as { resend: unknown }).resend = { domains: { create } };
    return { svc, create };
  };

  it.each([false, null])('refuses with "coming soon" and never calls Resend while the flag is %p', async (flag) => {
    const { svc, create } = build(flag);
    await expect(svc.addEmailDomain('s1', 'mail.acme.edu')).rejects.toThrow(/coming soon/);
    expect(create).not.toHaveBeenCalled();
  });

  it('with the flag on, maps a Resend domain-limit refusal to a 403, not a 500', async () => {
    const { svc, create } = build(true);
    await expect(svc.addEmailDomain('s1', 'mail.acme.edu')).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).toHaveBeenCalledWith({ name: 'mail.acme.edu' });
  });
});
