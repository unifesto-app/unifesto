import { normaliseHostname } from './white-label.service';

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
