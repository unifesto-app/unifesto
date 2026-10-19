import { WhiteLabelService } from './white-label.service';

const config = { get: (_k: string, fallback?: unknown) => fallback } as any;
const space = { slug: 'acme', subscription: { plan: 'PRO' }, whiteLabelEnabled: true, brandingSuspendedAt: null };

function svc(row: unknown, hasPerk = true) {
  const prisma = { spaceDomain: { findUnique: jest.fn(async () => row) } };
  const plan = { getEffectiveLimits: () => ({ hasRemoveBranding: hasPerk }) };
  return { s: new WhiteLabelService(prisma as any, plan as any, {} as any, {} as any, config), prisma };
}

describe('resolveHost', () => {
  it('resolves a verified web domain on a live space, ignoring case and port', async () => {
    const { s, prisma } = svc({ kind: 'WEB', status: 'verified', space });
    await expect(s.resolveHost('Events.Acme.EDU:443')).resolves.toEqual({ spaceSlug: 'acme' });
    expect(prisma.spaceDomain.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hostname: 'events.acme.edu' } }),
    );
  });

  it.each([
    ['unknown host', null, true],
    ['pending domain', { kind: 'WEB', status: 'pending', space }, true],
    ['email domain', { kind: 'EMAIL', status: 'verified', space }, true],
    ['plan lapsed', { kind: 'WEB', status: 'verified', space }, false],
    ['suspended', { kind: 'WEB', status: 'verified', space: { ...space, brandingSuspendedAt: new Date() } }, true],
    ['branding off', { kind: 'WEB', status: 'verified', space: { ...space, whiteLabelEnabled: false } }, true],
  ])('404s: %s', async (_name, row, perk) => {
    await expect(svc(row, perk as boolean).s.resolveHost('events.acme.edu')).rejects.toThrow('Unknown host');
  });
});

describe('isCustomDomainOrigin (CORS)', () => {
  it('allows a live custom domain and caches the answer', async () => {
    const { s, prisma } = svc({ kind: 'WEB', status: 'verified', space });
    await expect(s.isCustomDomainOrigin('https://events.acme.edu')).resolves.toBe(true);
    await expect(s.isCustomDomainOrigin('https://events.acme.edu')).resolves.toBe(true);
    expect(prisma.spaceDomain.findUnique).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unknown origin', null, 'https://evil.example.com'],
    ['suspended space', { kind: 'WEB', status: 'verified', space: { ...space, brandingSuspendedAt: new Date() } }, 'https://events.acme.edu'],
    ['pending domain', { kind: 'WEB', status: 'pending', space }, 'https://events.acme.edu'],
  ])('refuses %s', async (_name, row, origin) => {
    await expect(svc(row).s.isCustomDomainOrigin(origin as string)).resolves.toBe(false);
  });

  it.each(['http://events.acme.edu', 'https://events.acme.edu:8443', 'https://events.acme.edu/x', 'null'])(
    'refuses a non-exact origin %s without a lookup',
    async (origin) => {
      const { s, prisma } = svc({ kind: 'WEB', status: 'verified', space });
      await expect(s.isCustomDomainOrigin(origin)).resolves.toBe(false);
      expect(prisma.spaceDomain.findUnique).not.toHaveBeenCalled();
    },
  );

  it('does not cache a database error', async () => {
    const { s, prisma } = svc(null);
    prisma.spaceDomain.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(s.isCustomDomainOrigin('https://events.acme.edu')).resolves.toBe(false);
    await s.isCustomDomainOrigin('https://events.acme.edu');
    expect(prisma.spaceDomain.findUnique).toHaveBeenCalledTimes(2);
  });
});
