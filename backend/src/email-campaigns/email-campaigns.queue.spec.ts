import { EmailCampaignQueue } from './email-campaigns.queue';

describe('EmailCampaignQueue.add (J2)', () => {
  const make = (client: unknown) => {
    const q = new EmailCampaignQueue({ getClient: () => client } as any, {} as any);
    const add = jest.fn().mockResolvedValue(undefined);
    (q as any).queue = { add };
    return { q, add };
  };

  it('returns false without touching BullMQ while Redis is down, so the caller sends inline', async () => {
    const { q, add } = make(null);
    await expect(q.add('c1')).resolves.toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('queues when Redis is healthy', async () => {
    const { q, add } = make({});
    await expect(q.add('c1')).resolves.toBe(true);
    expect(add).toHaveBeenCalledWith('send', { campaignId: 'c1' }, expect.objectContaining({ jobId: 'c1' }));
  });
});
