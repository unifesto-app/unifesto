import { PENDING_CLAIM_TTL_MS, WhiteLabelService } from './white-label.service';

const env: Record<string, string> = { RESEND_API_KEY: 're_test', CLOUDFLARE_ZONE_ID: 'z', CLOUDFLARE_API_TOKEN: 't' };
const config = { get: (k: string, fallback?: unknown) => env[k] ?? fallback } as any;
const old = new Date(Date.now() - PENDING_CLAIM_TTL_MS - 60_000);
const cfActive = { id: 'cf1', hostname: 'events.acme.edu', status: 'active', ssl: { status: 'active' } };

function svc(rows: any[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const prisma = {
    spaceDomain: {
      findMany: jest.fn(async () => rows),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => byId.get(where.id)),
      update: jest.fn(async ({ where, data }: any) => ({ ...byId.get(where.id), ...data })),
      delete: jest.fn(async () => ({})),
    },
    event: { findMany: jest.fn(async () => []) },
  };
  const s = new WhiteLabelService(prisma as any, {} as any, { invalidateEventCache: jest.fn() } as any, {} as any, config) as any;
  s.resend = { domains: { get: jest.fn(async () => ({ data: { status: 'failed', records: [] }, error: null })), remove: jest.fn(async () => ({ error: null })) } };
  s.cfApi = jest.fn(async () => cfActive);
  s.dns = { resolveTxt: jest.fn(async () => []) };
  return { s, prisma };
}

const row = (o: any) => ({ spaceId: 'sp', providerId: 'p1', hostname: 'events.acme.edu', verifyToken: null, verifiedAt: null, createdAt: new Date(), ...o });

describe('sweepDomains', () => {
  it('drops a never-verified claim past its TTL, upstream object included', async () => {
    const { s, prisma } = svc([row({ id: 'a', kind: 'WEB', status: 'pending', createdAt: old })]);
    await expect(s.sweepDomains()).resolves.toMatchObject({ expired: 1 });
    expect(s.cfApi).toHaveBeenCalledWith('DELETE', '/p1');
    expect(prisma.spaceDomain.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
  });

  it('keeps an old domain that once verified, and a fresh pending claim', async () => {
    const { s, prisma } = svc([
      row({ id: 'a', kind: 'EMAIL', status: 'failed', createdAt: old, verifiedAt: old }),
      row({ id: 'b', kind: 'WEB', status: 'pending' }),
    ]);
    await expect(s.sweepDomains()).resolves.toMatchObject({ expired: 0 });
    expect(prisma.spaceDomain.delete).not.toHaveBeenCalled();
  });

  it('marks a verified sending domain lapsed when Resend no longer verifies it', async () => {
    const { s, prisma } = svc([row({ id: 'a', kind: 'EMAIL', status: 'verified', verifiedAt: old })]);
    await expect(s.sweepDomains()).resolves.toMatchObject({ lapsed: 1 });
    expect(prisma.spaceDomain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});

describe('web domain ownership TXT', () => {
  it('stays pending while Cloudflare is active but our TXT is missing', async () => {
    const { s } = svc([row({ id: 'a', kind: 'WEB', status: 'pending', verifyToken: 'tok' })]);
    const out = await s.refreshWebDomain('a');
    expect(out.status).toBe('pending');
    expect(s.dns.resolveTxt).toHaveBeenCalledWith('_unifesto.events.acme.edu');
    expect(out.records[0]).toMatchObject({ type: 'TXT', name: '_unifesto.events.acme.edu', value: 'unifesto-verify=tok', status: 'pending' });
  });

  it('verifies once the TXT matches', async () => {
    const { s } = svc([row({ id: 'a', kind: 'WEB', status: 'pending', verifyToken: 'tok' })]);
    s.dns.resolveTxt.mockResolvedValueOnce([['unifesto-verify=', 'tok']]);
    const out = await s.refreshWebDomain('a');
    expect(out.status).toBe('verified');
    expect(out.verifiedAt).toBeInstanceOf(Date);
  });

  it('gives a pre-H25 pending domain a token and requires it', async () => {
    const { s } = svc([row({ id: 'a', kind: 'WEB', status: 'pending' })]);
    const out = await s.refreshWebDomain('a');
    expect(out.verifyToken).toMatch(/^[0-9a-f]{32}$/);
    expect(out.status).toBe('pending');
  });

  it('grandfathers a domain verified before H25', async () => {
    const { s } = svc([row({ id: 'a', kind: 'WEB', status: 'verified', verifiedAt: old })]);
    const out = await s.refreshWebDomain('a');
    expect(out.status).toBe('verified');
    expect(s.dns.resolveTxt).not.toHaveBeenCalled();
  });
});

describe('space delete cleanup', () => {
  it('removes the Resend domain and Cloudflare hostname, tolerating failures', async () => {
    const { s } = svc([]);
    s.cfApi.mockRejectedValueOnce(new Error('gone'));
    await s.onDomainsOrphaned([
      { kind: 'WEB', hostname: 'events.acme.edu', providerId: 'cf1' },
      { kind: 'EMAIL', hostname: 'mail.acme.edu', providerId: 're1' },
    ]);
    expect(s.cfApi).toHaveBeenCalledWith('DELETE', '/cf1');
    expect(s.resend.domains.remove).toHaveBeenCalledWith('re1');
  });
});
