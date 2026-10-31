import {
  TrafficService,
  externalReferrerDomain,
  pagePath,
  fillDays,
  isBot,
  istDay,
  lastDays,
  referrerDomain,
  startOfIstDay,
} from './traffic.service';

describe('traffic helpers', () => {
  it('buckets days in IST, not UTC', () => {
    // 20:00 UTC on the 28th is 01:30 IST on the 29th.
    expect(istDay(new Date('2026-09-28T20:00:00Z'))).toBe('2026-09-29');
    expect(istDay(new Date('2026-09-28T18:00:00Z'))).toBe('2026-09-28');
  });

  it('lists the last N IST days oldest first and fills gaps with zeros', () => {
    const keys = lastDays(3, new Date('2026-10-01T02:00:00Z'));
    expect(keys).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(startOfIstDay(keys[0]).toISOString()).toBe('2026-09-28T18:30:00.000Z');
    expect(fillDays(keys, [{ day: '2026-09-30', views: 4 }], { views: 0 })).toEqual([
      { day: '2026-09-29', views: 0 },
      { day: '2026-09-30', views: 4 },
      { day: '2026-10-01', views: 0 },
    ]);
  });

  it('reads bots and referrer domains', () => {
    expect(isBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
    expect(referrerDomain('https://l.instagram.com/?u=x')).toBe('instagram.com');
    expect(referrerDomain('https://www.google.com/')).toBe('google.com');
    expect(referrerDomain('garbage')).toBeNull();
  });
});

describe('TrafficService', () => {
  // Visitor hashing needs a secret (S31: no hardcoded fallback).
  process.env.TRAFFIC_HASH_SECRET ??= 'test-traffic-secret';
  const build = () => {
    const prisma: any = {
      event: { findFirst: jest.fn() },
      space: { findFirst: jest.fn() },
      pageView: { findFirst: jest.fn(), create: jest.fn() },
    };
    return { prisma, service: new TrafficService(prisma) };
  };

  it('records a view once per visitor per 30 minutes', async () => {
    const { prisma, service } = build();
    prisma.event.findFirst.mockResolvedValue({ id: 'e1', spaceId: 's1' });
    const dto = { target: 'EVENT' as const, id: 'my-event', visitorId: 'visitor-123', platform: 'ios' as const };

    prisma.pageView.findFirst.mockResolvedValueOnce(null);
    await expect(service.recordView(dto)).resolves.toEqual({ recorded: true });
    expect(prisma.pageView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ target: 'EVENT', eventId: 'e1', spaceId: 's1', visitorId: 'visitor-123' }),
    });

    prisma.pageView.findFirst.mockResolvedValueOnce({ id: 'v1' });
    await expect(service.recordView(dto)).resolves.toEqual({ recorded: false });
    expect(prisma.pageView.create).toHaveBeenCalledTimes(1);
  });

  it('ignores views of pages that do not exist', async () => {
    const { prisma, service } = build();
    prisma.space.findFirst.mockResolvedValue(null);
    await expect(
      service.recordView({ target: 'SPACE', id: 'gone', visitorId: 'visitor-123', platform: 'android' }),
    ).resolves.toEqual({ recorded: false });
    expect(prisma.pageView.create).not.toHaveBeenCalled();
  });
});

describe('website page views (K6)', () => {
  process.env.TRAFFIC_HASH_SECRET ??= 'test-traffic-secret';
  const browser = { ip: '1.2.3.4', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' };
  const build = () => {
    const prisma: any = { pageView: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } };
    return { prisma, service: new TrafficService(prisma) };
  };

  it('normalises referrers to an external domain and paths to no query', () => {
    expect(externalReferrerDomain('https://www.google.com/search?q=unifesto')).toBe('google.com');
    expect(externalReferrerDomain('https://l.instagram.com/?u=https%3A%2F%2Fwww.unifesto.app')).toBe('instagram.com');
    expect(externalReferrerDomain('https://www.unifesto.app/events')).toBeNull();
    expect(externalReferrerDomain('https://space.unifesto.app/')).toBeNull();
    expect(externalReferrerDomain('https://notunifesto.app/')).toBe('notunifesto.app');
    expect(externalReferrerDomain('')).toBeNull();
    expect(externalReferrerDomain(undefined)).toBeNull();
    expect(pagePath('/event/x?utm_source=ig#top')).toBe('/event/x');
    expect(pagePath('//evil.com/x')).toBeNull();
    expect(pagePath('https://evil.com')).toBeNull();
  });

  it('stores path, referrer domain and utm with a hashed visitor, never the IP', async () => {
    const { prisma, service } = build();
    await expect(
      service.recordWebView(
        { path: '/blog/a?x=1', referrer: 'https://www.linkedin.com/feed/', source: 'li', campaign: 'launch' },
        browser,
      ),
    ).resolves.toEqual({ recorded: true });
    const data = prisma.pageView.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      target: 'PAGE',
      platform: 'web',
      path: '/blog/a',
      referrerDomain: 'linkedin.com',
      source: 'li',
      medium: null,
      campaign: 'launch',
    });
    expect(data.visitorId).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain('1.2.3.4');
  });

  it('drops bots and repeat loads', async () => {
    const { prisma, service } = build();
    await expect(service.recordWebView({ path: '/' }, { ip: '1.2.3.4', ua: 'Googlebot/2.1' })).resolves.toEqual({
      recorded: false,
    });
    prisma.pageView.findFirst.mockResolvedValueOnce({ id: 'v1' });
    await expect(service.recordWebView({ path: '/' }, browser)).resolves.toEqual({ recorded: false });
    expect(prisma.pageView.create).not.toHaveBeenCalled();
  });
});
