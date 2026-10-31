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

describe('Blog question start', () => {
  const build = (count: number) => {
    const updateMany = jest.fn(async () => ({ count }));
    const prisma: any = { blogQuestion: { updateMany, findUniqueOrThrow: jest.fn(async () => ({ id: 'q1' })) } };
    const svc = new BlogWriterService(prisma, {} as any, {} as any);
    const run = jest.spyOn(svc as any, 'run').mockResolvedValue({ status: 'published', slug: 's' });
    return { updateMany, run, svc };
  };

  it('claims a queued or failed question and writes it in the background', async () => {
    const { svc, updateMany, run } = build(1);
    await svc.start('q1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', status: { in: [BlogQuestionStatus.QUEUED, BlogQuestionStatus.FAILED] } },
      data: { status: BlogQuestionStatus.WRITING, failReason: null },
    });
    expect(run).toHaveBeenCalledWith({ id: 'q1' });
  });

  it('404s and writes nothing when the question is already writing or published', async () => {
    const { svc, run } = build(0);
    await expect(svc.start('q1')).rejects.toBeInstanceOf(NotFoundException);
    expect(run).not.toHaveBeenCalled();
  });
});
