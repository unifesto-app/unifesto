import { CAPPED_KINDS, DAILY_CAP, canSend } from './send-policy';

describe('canSend (C16)', () => {
  const build = (o: { settings?: any[]; optOuts?: any[]; counts?: Array<[string, number]> | Error } = {}) => ({
    notificationSettings: {
      findMany: jest.fn(async ({ where }: any) => {
        const rows = o.settings ?? [];
        // emailOptedOutUserIds asks for rows with a switch off; promotionsOptedInUserIds for promotions on.
        if (where.OR) return rows.filter((r) => r.emailEnabled === false || r.emailEventReminders === false);
        if (where.promotions) return rows.filter((r) => r.promotions);
        return rows;
      }),
    },
    marketingOptOut: { findMany: jest.fn().mockResolvedValue(o.optOuts ?? []) },
    messageDelivery: {
      groupBy: jest.fn(async (_args: any) => {
        if (o.counts instanceof Error) throw o.counts;
        return (o.counts ?? []).map(([userId, n]) => ({ userId, _count: { _all: n } }));
      }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });
  const ids = (s: Set<string>) => [...s].sort();

  it('push: on by default, off with push off or the category off, promotions only when opted in', async () => {
    const db = build({
      settings: [
        { userId: 'off', pushEnabled: false, newEvents: true },
        { userId: 'muted', pushEnabled: true, newEvents: false },
        { userId: 'promo', pushEnabled: true, promotions: true },
      ],
    });
    const news = await canSend(db as any, ['none', 'off', 'muted'], { kind: 'registrationUpdates', category: 'newEvents', channel: 'push' });
    expect(ids(news.allowed)).toEqual(['none']);
    const promo = await canSend(db as any, ['none', 'promo'], { kind: 'campaign', category: 'promotions', channel: 'push' });
    expect(ids(promo.allowed)).toEqual(['promo']);
  });

  it('email: the opt-out holds back optional mail, never a critical kind', async () => {
    const db = build({ settings: [{ userId: 'off', emailEnabled: false }] });
    const optional = await canSend(db as any, ['on', 'off'], { kind: 'event.reminder', category: 'eventReminders', channel: 'email' });
    expect(ids(optional.allowed)).toEqual(['on']);
    const critical = await canSend(db as any, ['on', 'off'], { kind: 'payment.confirmed', category: 'registrationUpdates', channel: 'email', critical: true });
    expect(ids(critical.allowed)).toEqual(['off', 'on']);
  });

  it('marketing: unsubscribed by account or by the address the link was for', async () => {
    const db = build({ optOuts: [{ address: 'b@x.in', userId: null }, { address: '+91', userId: 'c' }] });
    const out = await canSend(db as any, ['a', 'b', 'c'], {
      kind: 'campaign',
      category: 'organiserAnnouncements',
      channel: 'email',
      marketing: { spaceId: 's1' },
      addresses: new Map([['a', 'a@x.in'], ['b', 'B@x.in'], ['c', 'c@x.in']]),
    });
    expect(ids(out.allowed)).toEqual(['a']);
  });

  it('holds back anyone at the cap and logs them SKIPPED to the address', async () => {
    const db = build({ counts: [['full', DAILY_CAP], ['room', DAILY_CAP - 1]] });
    const out = await canSend(db as any, ['full', 'room', 'fresh'], {
      kind: 'event.published',
      category: 'newEvents',
      channel: 'email',
      addresses: new Map([['full', 'full@x.in']]),
      log: { provider: 'resend', label: 'Hack Night' },
    });
    expect(ids(out.allowed)).toEqual(['fresh', 'room']);
    expect(ids(out.capped)).toEqual(['full']);
    expect(db.messageDelivery.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ channel: 'EMAIL', kind: 'event.published', recipient: 'full@x.in', userId: 'full', status: 'SKIPPED', error: 'daily cap' }),
    ]);
    // Only today's sent capped kinds count.
    const where = db.messageDelivery.groupBy.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['SENT', 'DELIVERED', 'OPENED']);
    expect(where.kind.in).toEqual([...CAPPED_KINDS]);
  });

  it('never caps an exempt or critical kind, or one it does not know', async () => {
    const db = build({ counts: [['full', 99]] });
    for (const kind of ['registrationUpdates', 'payment.confirmed', 'otp']) {
      const out = await canSend(db as any, ['full'], { kind, category: 'registrationUpdates', channel: 'push' });
      expect(ids(out.allowed)).toEqual(['full']);
    }
    expect(db.messageDelivery.groupBy).not.toHaveBeenCalled();
  });

  it('a failed cap lookup lets everyone through', async () => {
    const db = build({ counts: new Error('db blip') });
    const out = await canSend(db as any, ['a'], { kind: 'newEvents', category: 'newEvents', channel: 'push' });
    expect(ids(out.allowed)).toEqual(['a']);
  });
});
