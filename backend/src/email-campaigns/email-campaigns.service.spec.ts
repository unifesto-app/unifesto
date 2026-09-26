import { ForbiddenException } from '@nestjs/common';
import { EmailTargetType } from '@prisma/client';
import { EmailCampaignsService } from './email-campaigns.service';

/**
 * Unit tests for the campaign engine's POLICY + pure logic — no real DB or SES.
 * Covers the two security-sensitive seams (signed click tracking, space-scoped
 * target validation) and the two DECISION helpers (A/B split, merge vars).
 */
describe('EmailCampaignsService', () => {
  const config = {
    get: (k: string) =>
      k === 'JWT_SECRET'
        ? 'test-secret'
        : k === 'PUBLIC_API_URL'
          ? 'https://api.test'
          : undefined,
  };
  const email = {
    wrapCampaignHtml: (c: string) => `<html><body>${c}</body></html>`,
    sendCustomCampaignEmail: jest.fn(),
  };

  const build = (prisma: any = {}) =>
    new EmailCampaignsService(prisma, email as any, config as any);

  describe('click-link signing', () => {
    it('verifies a URL it signed and rejects a tampered one', () => {
      const svc = build();
      const url = 'https://unifesto.app/event/123';
      const sig = svc.sign(url);
      expect(svc.verify(url, sig)).toBe(true);
      expect(svc.verify('https://evil.example/steal', sig)).toBe(false);
      expect(svc.verify(url, 'not-a-real-signature')).toBe(false);
    });

    it('recordClick refuses to redirect an unsigned/forged link', async () => {
      const svc = build();
      // Bad signature short-circuits before any DB access.
      const result = await svc.recordClick('log-1', 'https://evil.example', 'xxx');
      expect(result).toBeNull();
    });
  });

  describe('tracking HTML injection (via buildTrackedHtml)', () => {
    it('rewrites absolute hrefs to signed click URLs and appends an open pixel', () => {
      const svc = build();
      const campaign: any = {
        id: 'c1',
        body: '<p>Hi {{firstName}}</p><a href="https://unifesto.app/x">Go</a>',
        subjectB: null,
      };
      const html = (svc as any).buildTrackedHtml(
        campaign,
        { email: 'a@b.com', name: 'Dana Scully' },
        'log-9',
      );
      expect(html).toContain('/email/track/click/log-9?u=');
      expect(html).toContain('/email/track/open/log-9');
      expect(html).toContain('Hi Dana'); // merge var applied
      expect(html).not.toContain('href="https://unifesto.app/x"'); // original rewritten
    });
  });

  describe('A/B split (assignVariants — random assignment)', () => {
    it('gives everyone A when no split is set', () => {
      const svc = build();
      expect((svc as any).assignVariants(4, null)).toEqual(['A', 'A', 'A', 'A']);
    });

    it('keeps exact group sizes at 50% and the edges', () => {
      const svc = build();
      const half = (svc as any).assignVariants(10, 50) as string[];
      expect(half.filter((v) => v === 'A')).toHaveLength(5); // exact, order aside
      expect((svc as any).assignVariants(10, 100).every((v: string) => v === 'A')).toBe(true);
      expect((svc as any).assignVariants(10, 0).every((v: string) => v === 'B')).toBe(true);
    });

    it('randomises WHICH recipients get A (not the positional block order)', () => {
      const svc = build();
      // Deterministic rng makes the shuffle reproducible for the assertion.
      const shuffled = (svc as any).assignVariants(10, 50, () => 0.5) as string[];
      const blockOrder = ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'];
      expect(shuffled).not.toEqual(blockOrder); // a shuffle actually happened
      expect([...shuffled].sort()).toEqual([...blockOrder].sort()); // same multiset
    });
  });

  describe('merge variables (substituteVars)', () => {
    it('fills firstName/name/email and falls back for missing names', () => {
      const svc = build();
      const sub = (svc as any).substituteVars.bind(svc);
      expect(sub('Hi {{firstName}}', { email: 'x@y.com', name: 'Fox Mulder' })).toBe('Hi Fox');
      expect(sub('{{ email }}', { email: 'x@y.com' })).toBe('x@y.com');
      expect(sub('Hi {{firstName}}', { email: 'x@y.com', name: null })).toBe('Hi there');
      expect(sub('{{unknown}}', { email: 'x@y.com' })).toBe('{{unknown}}');
    });
  });

  describe('recipient address (usersToRecipients)', () => {
    it('sends to the PRIMARY email, not just the first one on file', () => {
      const svc = build();
      const [r] = (svc as any).usersToRecipients([
        {
          id: 'u1',
          fullName: 'Dana',
          identities: [
            { email: 'old@x.com', isPrimary: false },
            { email: 'primary@x.com', isPrimary: true },
          ],
        },
      ]);
      expect(r.email).toBe('primary@x.com');
    });

    it('falls back to any address when none is flagged primary', () => {
      const svc = build();
      const [r] = (svc as any).usersToRecipients([
        {
          id: 'u1',
          fullName: 'Dana',
          identities: [{ email: 'only@x.com', isPrimary: false }],
        },
      ]);
      expect(r.email).toBe('only@x.com');
    });

    it('drops users with no email on any identity', () => {
      const svc = build();
      const out = (svc as any).usersToRecipients([
        { id: 'u1', fullName: null, identities: [{ email: null, isPrimary: true }] },
      ]);
      expect(out).toHaveLength(0);
    });
  });

  describe('space-scoped target validation (resolveTarget)', () => {
    it('rejects an event that belongs to a different space', async () => {
      const prisma = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', spaceId: 'space-B' }) },
      };
      const svc = build(prisma);
      await expect(
        (svc as any).resolveTarget(
          { spaceId: 'space-A' },
          { targetType: EmailTargetType.EVENT_REGISTRANTS, targetId: 'e1', subject: 's', body: 'b' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a platform-only target (ALL_USERS) from a space scope', async () => {
      const svc = build();
      await expect(
        (svc as any).resolveTarget(
          { spaceId: 'space-A' },
          { targetType: EmailTargetType.ALL_USERS, subject: 's', body: 'b' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an event that belongs to the scoping space', async () => {
      const prisma = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', spaceId: 'space-A' }) },
      };
      const svc = build(prisma);
      await expect(
        (svc as any).resolveTarget(
          { spaceId: 'space-A' },
          { targetType: EmailTargetType.EVENT_REGISTRANTS, targetId: 'e1', subject: 's', body: 'b' },
        ),
      ).resolves.toBe('e1');
    });
  });
});
