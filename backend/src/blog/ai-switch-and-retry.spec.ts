import { readFileSync } from 'fs';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { BlogQuestionStatus } from '@prisma/client';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { FACTCHECK_SYSTEM, HUMANIZE_SYSTEM, RESEARCH_SYSTEM, WRITER_SYSTEM, splitSources } from './blog-writer';
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

describe('Blog question stop', () => {
  const build = (count: number) => {
    const updateMany = jest.fn(async () => ({ count }));
    const prisma: any = { blogQuestion: { updateMany, findUnique: jest.fn(async () => ({ id: 'q1' })) } };
    return { updateMany, svc: new BlogWriterService(prisma, {} as any, {} as any) };
  };

  it('marks only a WRITING question failed as stopped', async () => {
    const { svc, updateMany } = build(1);
    await svc.stop('q1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', status: BlogQuestionStatus.WRITING },
      data: { status: BlogQuestionStatus.FAILED, failReason: 'stopped' },
    });
  });

  it('404s when the question is not being written', async () => {
    await expect(build(0).svc.stop('q1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Blog writer fix rounds', () => {
  const SAMPLE = readFileSync(join(__dirname, '__fixtures__/sample-post.md'), 'utf8');
  const urls = [...splitSources(SAMPLE)[1].matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  const draft = (sources: string[]) => ({
    ok: true,
    text: '{"draft":"json"}',
    json: {
      intent: 'how-to',
      title: 'How to Organise a Hackathon in College',
      slug: 'how-to-organise-a-hackathon-in-college',
      metaTitle: 'How to Organise a College Hackathon',
      metaDescription: 'Book the venue early and plan for half your sign-ups to show.',
      excerpt: 'A timeline.',
      coverAlt: 'Blog card',
      markdown: SAMPLE,
      sources,
    },
  });

  /** Writer replies in order; the fact check flags `flagged` every time. */
  const build = (drafts: unknown[], flagged: string[] = []) => {
    const writerTurns: string[][] = [];
    const run = jest.fn(async (_f: string, input: any) => {
      if (input.system === RESEARCH_SYSTEM) {
        return { ok: true, text: 'notes', content: [{ type: 'web_search_tool_result', content: urls.map((url) => ({ url, title: url })) }] };
      }
      if (input.system === WRITER_SYSTEM) {
        writerTurns.push(input.messages.map((m: any) => m.content));
        return drafts.shift() ?? { ok: false, reason: 'error' };
      }
      if (input.system === HUMANIZE_SYSTEM) return { ok: true, text: input.messages[0].content };
      if (input.system === FACTCHECK_SYSTEM) return { ok: true, text: '', json: { unsupported: flagged } };
      throw new Error('unexpected call');
    });
    const prisma: any = {
      blogPost: {
        findMany: jest.fn(async () => [
          { slug: 'how-to-organize-a-college-fest', title: 'How to Organize a College Fest', excerpt: '8 weeks.' },
          { slug: 'unifesto-vs-google-forms', title: 'Unifesto vs Google Forms', excerpt: '' },
        ]),
      },
      blogQuestion: {
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
        count: jest.fn(async () => 1),
      },
    };
    const blog: any = { create: jest.fn(async (d: any) => ({ id: 'p1', slug: d.slug })) };
    const svc = new BlogWriterService(prisma, { run } as any, blog);
    const q = { id: 'q1', question: 'How do I run a hackathon?', intent: 'how-to', angle: null, appLink: '/sprint' };
    return { writerTurns, prisma, blog, go: () => (svc as any).run(q) };
  };

  it('publishes nothing when stopped while writing', async () => {
    const { go, prisma, blog, writerTurns } = build([draft(urls)]);
    // Still claimed when the round starts, stopped by the time the post is ready.
    prisma.blogQuestion.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(go()).resolves.toEqual({ status: 'skipped', reason: 'stopped' });
    expect(writerTurns).toHaveLength(1);
    expect(blog.create).not.toHaveBeenCalled();
    expect(prisma.blogQuestion.updateMany).not.toHaveBeenCalled();
  });

  it('retries a cut-off draft, sends a failed gate back to the writer and publishes the fix', async () => {
    const { go, writerTurns } = build([
      { ok: false, reason: 'error', detail: 'stop_reason max_tokens' },
      draft(urls.slice(0, 1)),
      draft(urls),
    ]);
    await expect(go()).resolves.toEqual({ status: 'published', slug: 'how-to-organise-a-hackathon-in-college' });
    expect(writerTurns.map((t) => t.length)).toEqual([1, 1, 3]);
    expect(writerTurns[2][2]).toMatch(/fewer than 2 sources/);
  });

  it('gives up after the fix rounds with the last reason', async () => {
    const { go, writerTurns } = build([draft(urls), draft(urls), draft(urls)], ['the 8-week checklist']);
    await expect(go()).resolves.toMatchObject({ status: 'failed', reason: 'gate: unsupported numbers: the 8-week checklist' });
    expect(writerTurns).toHaveLength(3);
    expect(writerTurns[2][4]).toMatch(/not in the research, <internal_links>/);
  });
});
