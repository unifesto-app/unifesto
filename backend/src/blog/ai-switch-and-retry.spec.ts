import { NotFoundException } from '@nestjs/common';
import { BlogQuestionStatus } from '@prisma/client';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { BlogWriterService } from './blog-writer.service';

describe('AI feature switch', () => {
  it('keeps only known features, in registry order', async () => {
    const upsert = jest.fn(async () => ({}));
    const svc = new PlatformConfigService({ platformConfig: { upsert } } as any);
    await svc.setAiEnabledFeatures(['blog_writer', 'nope', 'triage']);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { aiEnabledFeatures: ['triage', 'blog_writer'] } }),
    );
  });
});

describe('Blog question retry', () => {
  const build = (count: number) => {
    const updateMany = jest.fn(async () => ({ count }));
    const prisma: any = { blogQuestion: { updateMany, findUnique: jest.fn(async () => ({ id: 'q1' })) } };
    return { updateMany, svc: new BlogWriterService(prisma, {} as any, {} as any) };
  };

  it('re-queues only a FAILED question and clears the reason', async () => {
    const { svc, updateMany } = build(1);
    await svc.retryQuestion('q1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', status: BlogQuestionStatus.FAILED },
      data: { status: BlogQuestionStatus.QUEUED, failReason: null },
    });
  });

  it('404s when the question is not failed', async () => {
    const { svc } = build(0);
    await expect(svc.retryQuestion('q1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
