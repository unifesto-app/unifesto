import { ForbiddenException } from '@nestjs/common';
import { emailDomainCreateError, normaliseHostname } from './white-label.service';

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
    expect(e.message).toMatch(/aren't available/);
  });
  it('keeps other provider messages as a 400', () => {
    const e = emailDomainCreateError({ name: 'validation_error', message: 'Invalid domain name' });
    expect(e.getStatus()).toBe(400);
    expect(e.message).toBe('Invalid domain name');
  });
});
