import { MarketingChannel } from '@prisma/client';
import { marketingOptOuts, resubscribeUserToSpace, setUserMarketing, userMarketingPrefs } from './marketing-opt-out';

/** Just enough of marketing_opt_outs for the where shapes these helpers use. */
function fakeDb() {
  const rows: any[] = [];
  const match = (r: any, w: any): boolean =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((o: any) => match(r, o));
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
      return r[k] === v;
    });
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        mobileNumber: '9848945690',
        identities: [{ email: 'Me@Example.com' }, { email: null }, { email: 'alt@example.com' }],
      }),
    },
    marketingOptOut: {
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => match(r, where))),
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null),
      create: jest.fn(async ({ data }: any) => rows.push(data)),
      deleteMany: jest.fn(async ({ where }: any) => {
        const keep = rows.filter((r) => !match(r, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      }),
    },
  };
  return { prisma, rows };
}

describe('settings marketing switches ↔ MarketingOptOut (C4)', () => {
  it('email off records a global row per address; on removes them; campaigns see both', async () => {
    const { prisma, rows } = fakeDb();
    expect(await userMarketingPrefs(prisma, 'u1')).toEqual({ email: true, whatsapp: true, spaceIds: [] });

    await setUserMarketing(prisma, 'u1', MarketingChannel.EMAIL, false);
    expect(rows.map((r) => [r.address, r.spaceId, r.userId, r.source])).toEqual([
      ['me@example.com', null, 'u1', 'settings'],
      ['alt@example.com', null, 'u1', 'settings'],
    ]);
    expect((await userMarketingPrefs(prisma, 'u1')).email).toBe(false);
    // The campaign consent check (C8) sees the same rows.
    expect((await marketingOptOuts(prisma, MarketingChannel.EMAIL, 'space-x')).addresses.has('me@example.com')).toBe(true);

    await setUserMarketing(prisma, 'u1', MarketingChannel.EMAIL, false); // repeat: no duplicates
    expect(rows).toHaveLength(2);

    await setUserMarketing(prisma, 'u1', MarketingChannel.EMAIL, true);
    expect(rows).toHaveLength(0);
    expect((await userMarketingPrefs(prisma, 'u1')).email).toBe(true);
  });

  it('turning email on also clears an unsubscribe-link row with no userId, but keeps space opt-outs', async () => {
    const { prisma, rows } = fakeDb();
    rows.push(
      { channel: 'EMAIL', address: 'alt@example.com', spaceId: null, userId: null, source: 'link' },
      { channel: 'EMAIL', address: 'me@example.com', spaceId: 'space-1', userId: null, source: 'link' },
    );
    expect(await userMarketingPrefs(prisma, 'u1')).toEqual({ email: false, whatsapp: true, spaceIds: ['space-1'] });

    await setUserMarketing(prisma, 'u1', MarketingChannel.EMAIL, true);
    expect(await userMarketingPrefs(prisma, 'u1')).toEqual({ email: true, whatsapp: true, spaceIds: ['space-1'] });

    await resubscribeUserToSpace(prisma, 'u1', 'space-1');
    expect(rows).toHaveLength(0);
  });

  it('WhatsApp: off records the dial form; on clears a STOP row', async () => {
    const { prisma, rows } = fakeDb();
    await setUserMarketing(prisma, 'u1', MarketingChannel.WHATSAPP, false);
    expect(rows).toEqual([
      expect.objectContaining({ channel: 'WHATSAPP', address: '+919848945690', spaceId: null, userId: 'u1' }),
    ]);
    expect(await userMarketingPrefs(prisma, 'u1')).toEqual({ email: true, whatsapp: false, spaceIds: [] });

    rows.splice(0);
    rows.push({ channel: 'WHATSAPP', address: '+919848945690', spaceId: null, userId: null, source: 'whatsapp_stop' });
    expect((await userMarketingPrefs(prisma, 'u1')).whatsapp).toBe(false);
    await setUserMarketing(prisma, 'u1', MarketingChannel.WHATSAPP, true);
    expect(rows).toHaveLength(0);
  });
});
