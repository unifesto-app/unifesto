import { EmailCampaignsService } from './email-campaigns.service';

/** S64 item 4: the A/B panel counts every log, not just the newest 200 rows. */
describe('EmailCampaignsService.getCampaign A/B stats', () => {
  const config = { get: (k: string) => (k === 'JWT_SECRET' ? 'test-secret' : undefined) };
  const build = (prisma: any) => new EmailCampaignsService(prisma, {} as any, config as any, {} as any);
  const campaign = { id: 'c1', spaceId: null, logs: [] };

  it('tallies sends, opens and clicks per variant from the grouped counts', async () => {
    const prisma: any = {
      emailCampaign: { findUnique: jest.fn(async () => campaign) },
      emailCampaignLog: {
        groupBy: jest.fn(async () => [
          { variant: 'A', _count: { _all: 600, openedAt: 240, firstClickedAt: 30 } },
          { variant: 'B', _count: { _all: 590, openedAt: 300, firstClickedAt: 45 } },
        ]),
      },
    };
    const out = await build(prisma).getCampaign({ spaceId: null } as any, 'c1');
    expect(prisma.emailCampaignLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['variant'], where: { campaignId: 'c1' } }),
    );
    expect(out.stats).toEqual({
      a: { sent: 600, opens: 240, clicks: 30 },
      b: { sent: 590, opens: 300, clicks: 45 },
    });
  });

  it('has no A/B stats for a single-subject campaign', async () => {
    const prisma: any = {
      emailCampaign: { findUnique: jest.fn(async () => campaign) },
      emailCampaignLog: { groupBy: jest.fn(async () => [{ variant: null, _count: { _all: 5, openedAt: 1, firstClickedAt: 0 } }]) },
    };
    const out = await build(prisma).getCampaign({ spaceId: null } as any, 'c1');
    expect(out.stats).toBeNull();
  });
});
