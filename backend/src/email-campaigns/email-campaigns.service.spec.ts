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

  const queue = { add: jest.fn().mockResolvedValue(true) };
  const build = (prisma: any = {}) =>
    new EmailCampaignsService(prisma, email as any, config as any, queue as any);

  describe('click-link signing', () => {
    it('verifies a URL it signed and rejects a tampered one', () => {
      const svc = build();
      const url = 'https://unifesto.app/event/123';
      const sig = svc.sign(url);
      expect(svc.verify(url, sig)).toBe(true);
      expect(svc.verify('https://evil.example/steal', sig)).toBe(false);
      expect(svc.verify(url, 'not-a-real-signature')).toBe(false);
    });

    it('signs with a dedicated key but still accepts pre-S31 JWT_SECRET links', () => {
      const { createHmac } = require('crypto');
      const url = 'https://unifesto.app/event/123';
      const legacy = createHmac('sha256', 'test-secret').update(url).digest('base64url');
      const svc = build();
      expect(svc.sign(url)).not.toBe(legacy);
      expect(svc.verify(url, legacy)).toBe(true);
      const forged = createHmac('sha256', 'unifesto-email-tracking').update(url).digest('base64url');
      expect(svc.verify(url, forged)).toBe(false);
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

  describe('queued, resumable sending (S33)', () => {
    const campaignRow = {
      id: 'c1',
      status: 'SENDING',
      subject: 'Hi',
      subjectB: null,
      abSplitPct: null,
      body: '<p>x</p>',
      targetType: EmailTargetType.SINGLE_USER,
      targetId: 'u',
    };
    const users = ['a', 'b', 'c'].map((id) => ({
      id,
      fullName: id.toUpperCase(),
      identities: [{ email: `${id}@x.com`, isPrimary: true }],
    }));

    const prismaFor = (loggedEmails: string[]) => ({
      emailCampaign: {
        findUnique: jest.fn().mockResolvedValue(campaignRow),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'c1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      emailCampaignLog: {
        findMany: jest.fn().mockResolvedValue(loggedEmails.map((recipientEmail) => ({ recipientEmail }))),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(3),
      },
      user: { findMany: jest.fn().mockResolvedValue(users) },
      notificationSettings: { findMany: jest.fn().mockResolvedValue([]) },
    });

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      email.sendCustomCampaignEmail.mockReset().mockResolvedValue({ messageId: 'm' });
      queue.add.mockClear();
    });
    afterEach(() => jest.useRealTimers());

    const runAll = async (p: Promise<unknown>) => {
      // Let the 1s inter-batch pause elapse.
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(1000);
      }
      return p;
    };

    it('a resumed run skips recipients that already have a log row', async () => {
      const prisma = prismaFor(['a@x.com']);
      const svc = build(prisma);
      await runAll(svc.runCampaign('c1', { lastAttempt: true }));
      const sentTo = email.sendCustomCampaignEmail.mock.calls.map(([a]: any) => a.to);
      expect(sentTo).toEqual(['b@x.com', 'c@x.com']);
      expect(prisma.emailCampaign.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', totalSent: 3 }) }),
      );
    });

    it('send-now claims the row and queues it instead of sending in the request', async () => {
      const prisma = prismaFor([]);
      const svc = build(prisma);
      jest.spyOn(svc as any, 'resolveTarget').mockResolvedValue('u');
      await svc.createCampaign({ spaceId: null }, 'admin', {
        subject: 'Hi',
        body: 'x',
        targetType: EmailTargetType.SINGLE_USER,
        targetId: 'u',
      } as any);
      expect(prisma.emailCampaign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SENDING' } }),
      );
      expect(queue.add).toHaveBeenCalledWith('c1');
      expect(email.sendCustomCampaignEmail).not.toHaveBeenCalled();
    });

    it('stale sweep fails day-old SENDING rows and re-queues recent stalls', async () => {
      const prisma = prismaFor([]);
      prisma.emailCampaign.findMany.mockResolvedValue([{ id: 'c1' }]);
      const svc = build(prisma);
      const now = new Date('2026-10-15T12:00:00Z');
      expect(await svc.sweepStaleCampaigns(now)).toBe(1);
      expect(prisma.emailCampaign.updateMany.mock.calls[0][0]).toEqual({
        where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - 86_400_000) } },
        data: { status: 'FAILED' },
      });
      expect(queue.add).toHaveBeenCalledWith('c1');
    });
  });

  describe('confirm step (countAudience / sendTest)', () => {
    const user = (id: string, email: string | null) => ({
      id,
      fullName: `User ${id}`,
      identities: email ? [{ email, isPrimary: true }] : [],
    });

    it('counts the same people the send would mail: no email, opted out dropped', async () => {
      const prisma: any = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', spaceId: 's1' }) },
        eventRegistration: {
          findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]),
        },
        user: {
          findMany: jest
            .fn()
            .mockResolvedValue([user('u1', 'a@x.com'), user('u2', null), user('u3', 'c@x.com')]),
        },
        notificationSettings: { findMany: jest.fn().mockResolvedValue([{ userId: 'u3' }]) },
      };
      await expect(
        build(prisma).countAudience(
          { spaceId: 's1' },
          { targetType: EmailTargetType.EVENT_REGISTRANTS, targetId: 'e1' },
        ),
      ).resolves.toEqual({ recipientCount: 1 });
      expect(prisma.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eventId: 'e1', status: { in: ['REGISTERED', 'ATTENDED'] } }),
        }),
      );
    });

    it('applies the same space scoping as a real send', async () => {
      await expect(
        build({}).countAudience({ spaceId: 's1' }, { targetType: EmailTargetType.ALL_USERS }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('mails a test to the sender only, merge vars filled, untracked', async () => {
      email.sendCustomCampaignEmail.mockResolvedValueOnce({ messageId: 'm1' });
      const prisma: any = { user: { findMany: jest.fn().mockResolvedValue([user('me', 'me@x.com')]) } };
      await expect(
        build(prisma).sendTest('me', { subject: 'Hi {{firstName}}', body: '<a href="https://x.y">{{name}}</a>' }),
      ).resolves.toEqual({ sentTo: 'me@x.com' });
      const sent = email.sendCustomCampaignEmail.mock.calls.at(-1)[0];
      expect(sent.to).toBe('me@x.com');
      expect(sent.subject).toBe('[Test] Hi User');
      expect(sent.html).toContain('User me');
      expect(sent.html).not.toContain('/email/track/');
    });
  });
});
