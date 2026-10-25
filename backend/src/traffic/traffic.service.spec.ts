import {
  TrafficService,
  countryOf,
  externalReferrerDomain,
  pagePath,
  deviceOf,
  fillDays,
  isAllowedDestination,
  isBot,
  istDay,
  lastDays,
  referrerDomain,
  sourceSlug,
  startOfIstDay,
  withShortLinkTags,
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

  it('tags destinations, replacing existing utm tags', () => {
    const url = withShortLinkTags('https://www.unifesto.app/event/x?utm_source=old&ref=1', 'instagram', 'Ab3xYz9');
    const q = new URL(url).searchParams;
    expect(q.get('utm_source')).toBe('instagram');
    expect(q.get('utm_medium')).toBe('short_link');
    expect(q.get('utm_campaign')).toBe('Ab3xYz9');
    expect(q.get('ref')).toBe('1');
  });

  it('only allows https unifesto.app destinations', () => {
    expect(isAllowedDestination('https://www.unifesto.app/blog/a')).toBe(true);
    expect(isAllowedDestination('https://unifesto.app')).toBe(true);
    expect(isAllowedDestination('http://www.unifesto.app')).toBe(false);
    expect(isAllowedDestination('https://unifesto.app.evil.com')).toBe(false);
    expect(isAllowedDestination('https://evilunifesto.app')).toBe(false);
    expect(isAllowedDestination('not a url')).toBe(false);
  });

  it('reads device, bots and referrer domains', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
    expect(isBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
    expect(referrerDomain('https://l.instagram.com/?u=x')).toBe('instagram.com');
    expect(referrerDomain('https://www.google.com/')).toBe('google.com');
    expect(referrerDomain('garbage')).toBeNull();
    expect(sourceSlug('Instagram Bio!')).toBe('instagram-bio');
    expect(sourceSlug('  ')).toBe('link');
  });

  it('keeps real Cloudflare countries and drops unknown, Tor and junk', () => {
    expect(countryOf('IN')).toBe('IN');
    expect(countryOf(' us ')).toBe('US');
    expect(countryOf('XX')).toBeNull();
    expect(countryOf('T1')).toBeNull();
    expect(countryOf('India')).toBeNull();
    expect(countryOf(undefined)).toBeNull();
  });
});

describe('TrafficService', () => {
  // Visitor hashing needs a secret (S31: no hardcoded fallback).
  process.env.TRAFFIC_HASH_SECRET ??= 'test-traffic-secret';
  const build = () => {
    const prisma: any = {
      shortLink: { findUnique: jest.fn(), update: jest.fn() },
      shortLinkClick: { create: jest.fn() },
      event: { findFirst: jest.fn() },
      space: { findFirst: jest.fn() },
      pageView: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { prisma, service: new TrafficService(prisma) };
  };
  const browser = { ip: '1.2.3.4', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' };

  it('resolves an active code to its destination and records the click', async () => {
    const { prisma, service } = build();
    prisma.shortLink.findUnique.mockResolvedValue({ id: 'l1', url: 'https://www.unifesto.app/event/x', revokedAt: null });
    await expect(service.resolve('Ab3xYz9', { ...browser, country: 'IN' })).resolves.toBe(
      'https://www.unifesto.app/event/x',
    );
    await new Promise((r) => setImmediate(r));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.shortLinkClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shortLinkId: 'l1', device: 'ios', country: 'IN' }),
    });
  });

  it('sends an event link to the current slug after a rename (B16)', async () => {
    const { prisma, service } = build();
    prisma.shortLink.findUnique.mockResolvedValue({
      id: 'l1',
      url: 'https://www.unifesto.app/event/old-name?utm_source=poster&utm_medium=short_link&utm_campaign=Ab3xYz9',
      target: 'EVENT',
      source: 'poster',
      revokedAt: null,
      event: { slug: 'new-name' },
      space: { slug: 'club' },
    });
    const to = new URL(await service.resolve('Ab3xYz9', browser));
    expect(to.pathname).toBe('/event/new-name');
    expect(to.searchParams.get('utm_source')).toBe('poster');
    expect(to.searchParams.get('utm_campaign')).toBe('Ab3xYz9');
  });

  it('renders a QR of the short URL for active links only', async () => {
    const { prisma, service } = build();
    prisma.shortLink.findUnique.mockResolvedValueOnce({ revokedAt: null });
    await expect(service.qr('Ab3xYz9', 'svg')).resolves.toContain('<svg');
    prisma.shortLink.findUnique.mockResolvedValueOnce({ revokedAt: null });
    const png = (await service.qr('Ab3xYz9', 'png')) as Buffer;
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    prisma.shortLink.findUnique.mockResolvedValueOnce({ revokedAt: new Date() });
    await expect(service.qr('Ab3xYz9', 'svg')).resolves.toBeNull();
    await expect(service.qr('../etc', 'svg')).resolves.toBeNull();
    // First qrcode/pngjs load under jest's VM modules can take ~5s on CI.
  }, 20_000);

  it('sends unknown, revoked and malformed codes home without recording', async () => {
    const { prisma, service } = build();
    prisma.shortLink.findUnique.mockResolvedValueOnce(null);
    await expect(service.resolve('nope123', browser)).resolves.toBe('https://www.unifesto.app');
    prisma.shortLink.findUnique.mockResolvedValueOnce({ id: 'l1', url: 'https://x', revokedAt: new Date() });
    await expect(service.resolve('Ab3xYz9', browser)).resolves.toBe('https://www.unifesto.app');
    await expect(service.resolve('../etc', browser)).resolves.toBe('https://www.unifesto.app');
    expect(prisma.shortLink.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('redirects link-preview bots without counting them', async () => {
    const { prisma, service } = build();
    prisma.shortLink.findUnique.mockResolvedValue({ id: 'l1', url: 'https://www.unifesto.app/event/x', revokedAt: null });
    await service.resolve('Ab3xYz9', { ip: '1.2.3.4', ua: 'WhatsApp/2.23.20.0' });
    await new Promise((r) => setImmediate(r));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

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

  it('rejects admin links off unifesto.app and ambiguous targets', async () => {
    const { service } = build();
    await expect(service.createAdmin('u1', { url: 'https://evil.com' })).rejects.toThrow('unifesto.app');
    await expect(service.createAdmin('u1', { url: 'https://www.unifesto.app', spaceId: 's1' } as any)).rejects.toThrow(
      'exactly one',
    );
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
