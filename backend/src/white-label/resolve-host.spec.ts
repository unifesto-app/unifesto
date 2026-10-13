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
