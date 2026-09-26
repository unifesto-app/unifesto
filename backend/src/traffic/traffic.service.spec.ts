import { PageTarget } from '@prisma/client';
import { TrafficService, istDay } from './traffic.service';

describe('istDay', () => {
  it('buckets by the Indian calendar day, not UTC', () => {
    // 20:00 UTC on 26 Sep is 01:30 IST on 27 Sep.
    expect(istDay(new Date('2026-09-26T20:00:00Z'))).toBe('2026-09-27');
    expect(istDay(new Date('2026-09-26T18:00:00Z'))).toBe('2026-09-26');
  });
});

describe('TrafficService.resolve', () => {
  const link = {
    id: 'l1',
    code: 'abc1234',
    target: PageTarget.EVENT,
    utmSource: 'instagram',
    utmMedium: 'social',
    utmCampaign: null,
    deletedAt: null as Date | null,
    event: { id: 'e1', slug: 'hack-night', title: 'Hack night' },
    space: { id: 's1', slug: 'club' },
  };

  function make(found: typeof link | null) {
    const update = jest.fn().mockResolvedValue({});
    const prisma = { shortLink: { findUnique: jest.fn().mockResolvedValue(found), update } };
    return { svc: new TrafficService(prisma as any), update };
  }

  beforeEach(() => {
    process.env.WEB_URL = 'https://unifesto.app';
  });

  it('sends a live link to its tagged page and counts the click', async () => {
    const { svc, update } = make(link);
    await expect(svc.resolve('abc1234')).resolves.toEqual({
      url: 'https://unifesto.app/event/hack-night?utm_source=instagram&utm_medium=social',
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clicks: { increment: 1 } }) }),
    );
  });

  it('sends deleted and unknown codes home without counting', async () => {
    const deleted = make({ ...link, deletedAt: new Date() });
    await expect(deleted.svc.resolve('abc1234')).resolves.toEqual({ url: 'https://unifesto.app' });
    expect(deleted.update).not.toHaveBeenCalled();

    const unknown = make(null);
    await expect(unknown.svc.resolve('nope')).resolves.toEqual({ url: 'https://unifesto.app' });
  });
});
