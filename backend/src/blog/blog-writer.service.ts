import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BlogQuestion, BlogQuestionSource, BlogQuestionStatus, BlogStatus } from '@prisma/client';
import { AiResult, AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlogService } from './blog.service';
import {
  APP_PAGES,
  BLOG_AUTHOR,
  DAILY_POST_CAP,
  DRAFT_SCHEMA,
  Draft,
  FACTCHECK_SCHEMA,
  FACTCHECK_SYSTEM,
  HUMANIZE_SYSTEM,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  QUESTIONS_SCHEMA,
  QUESTIONS_SYSTEM,
  RESEARCH_SYSTEM,
  RESEARCH_TOOLS,
  TOPIC_COOLDOWN_DAYS,
  WRITER_SYSTEM,
  cleanSuggestions,
  fit,
  gate,
  normUrl,
  researchSources,
  slugify,
  sourcesList,
  splitSources,
  stripEmDashes,
  topBlogPages,
  wordCount,
} from './blog-writer';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A WRITING row older than this died mid-run; put it back in the queue. */
const STALE_MS = 60 * 60 * 1000;
const REFILL_COUNT = 20;
const LEARN_COUNT = 10;

/** A failed step's reason for the queue, e.g. "error (stop_reason max_tokens)". */
const why = (r: Extract<AiResult, { ok: false }>) => (r.detail ? `${r.reason} (${r.detail})` : r.reason);

export type GenerateResult =
  | { status: 'published'; slug: string }
  | { status: 'failed'; question: string; reason: string }
  | { status: 'skipped'; reason: string };

/**
 * The auto-blog: every 8 hours, take the oldest queued question whose topic
 * hasn't been published in the last 7 days, research it, write, humanize,
 * gate and publish. A failure marks the question FAILED and the next run moves
 * on. The whole thing is off until 'blog_writer' is in aiEnabledFeatures.
 */
@Injectable()
export class BlogWriterService {
  private readonly logger = new Logger(BlogWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly blog: BlogService,
  ) {}

  @Cron('0 6,14,22 * * *', { timeZone: 'Asia/Kolkata' })
  async scheduled() {
    const r = await this.generate();
    this.logger.log(`Auto-blog run: ${JSON.stringify(r)}`);
  }

  async generate(): Promise<GenerateResult> {
    const since = new Date(Date.now() - DAY_MS);
    const today = await this.prisma.blogQuestion.count({
      where: { status: BlogQuestionStatus.PUBLISHED, updatedAt: { gte: since } },
    });
    if (today >= DAILY_POST_CAP) return { status: 'skipped', reason: 'daily cap reached' };

    await this.prisma.blogQuestion.updateMany({
      where: { status: BlogQuestionStatus.WRITING, updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: BlogQuestionStatus.QUEUED },
    });

    let q = await this.next();
    if (q === undefined) {
      const added = await this.refill();
      if (!added) return { status: 'skipped', reason: 'queue empty and refill failed' };
      q = await this.next();
    }
    if (!q) return { status: 'skipped', reason: `every queued topic was covered in the last ${TOPIC_COOLDOWN_DAYS} days` };

    const claimed = await this.prisma.blogQuestion.updateMany({
      where: { id: q.id, status: BlogQuestionStatus.QUEUED },
      data: { status: BlogQuestionStatus.WRITING },
    });
    if (!claimed.count) return { status: 'skipped', reason: 'another run took it' };
    return this.run(q);
  }

  /**
   * ADMIN "Start": write this queued or failed question now, ignoring the daily
   * cap and topic cooldown. Returns once it's claimed; the write runs in the
   * background (minutes, longer than a request should wait).
   */
  async start(id: string) {
    const { count } = await this.prisma.blogQuestion.updateMany({
      where: { id, status: { in: [BlogQuestionStatus.QUEUED, BlogQuestionStatus.FAILED] } },
      data: { status: BlogQuestionStatus.WRITING, failReason: null },
    });
    if (!count) throw new NotFoundException('No queued or failed question with that id');
    const q = await this.prisma.blogQuestion.findUniqueOrThrow({ where: { id } });
    this.run(q).then(
      (r) => this.logger.log(`Auto-blog start: ${JSON.stringify(r)}`),
      (err) => this.logger.error(`Auto-blog start ${id} crashed: ${(err as Error).message}`),
    );
    return q;
  }

  /** Write a claimed (WRITING) question; a failure marks it FAILED with the reason. */
  private async run(q: BlogQuestion): Promise<GenerateResult> {
    try {
      const slug = await this.write(q);
      return { status: 'published', slug };
    } catch (err) {
      const reason = (err as Error).message.slice(0, 500);
      await this.prisma.blogQuestion.update({
        where: { id: q.id },
        data: { status: BlogQuestionStatus.FAILED, failReason: reason },
      });
      return { status: 'failed', question: q.question, reason };
    }
  }

  /** Oldest queued question off cooldown; null if all are on cooldown, undefined if none queued. */
  private async next(): Promise<BlogQuestion | null | undefined> {
    const queued = await this.prisma.blogQuestion.findMany({
      where: { status: BlogQuestionStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
    });
    if (!queued.length) return undefined;
    const recent = await this.prisma.blogQuestion.findMany({
      where: {
        status: BlogQuestionStatus.PUBLISHED,
        updatedAt: { gte: new Date(Date.now() - TOPIC_COOLDOWN_DAYS * DAY_MS) },
      },
      select: { topic: true },
    });
    const cooling = new Set(recent.map((r) => r.topic));
    return queued.find((x) => !cooling.has(x.topic)) ?? null;
  }

  private async write(q: BlogQuestion): Promise<string> {
    const subject = `blog-question:${q.id}`;

    // a. Research, keeping every URL the model actually read.
    const research = await this.ai.run('blog_writer', {
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: q.question }],
      tools: RESEARCH_TOOLS,
      timeoutMs: 180_000,
      subject,
    });
    if (!research.ok) throw new Error(`research: ${why(research)}`);
    const sources = researchSources(research.content ?? []);
    if (sources.length < 2) throw new Error(`research found ${sources.length} sources`);
    const notes = research.text;

    // b + c. Intent, outline and draft in one structured call.
    const posts = await this.prisma.blogPost.findMany({
      where: { status: BlogStatus.PUBLISHED },
      select: { slug: true, title: true, excerpt: true },
    });
    const links = [
      ...posts.map((p) => `/blog/${p.slug}: ${p.title}. ${p.excerpt}`),
      ...APP_PAGES.map((p) => `${p} (app page)`),
    ].join('\n');
    const draftRun = await this.ai.run('blog_writer', {
      system: WRITER_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            `<question>${q.question}</question>`,
            `<intent_hint>${q.intent}</intent_hint>`,
            `<angle>${q.angle ?? 'none'}</angle>`,
            `<app_link>${q.appLink ?? 'none'}</app_link>`,
            `<today>${new Date().toISOString().slice(0, 10)}</today>`,
            `<research>\n${notes}\n</research>`,
            `<sources>\n${sources.map((s) => `${s.title}: ${s.url}`).join('\n')}\n</sources>`,
            `<internal_links>\n${links}\n</internal_links>`,
          ].join('\n'),
        },
      ],
      outputConfig: { effort: 'medium', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      timeoutMs: 180_000,
      subject,
    });
    if (!draftRun.ok) throw new Error(`draft: ${why(draftRun)}`);
    const draft = draftRun.json as Draft;

    // d. Humanize: a separate editor prompt that only rewrites prose. The
    //    Sources list is then built from the cited URLs, never by a model.
    const [body] = splitSources(draft.markdown);
    const edit = await this.ai.run('blog_writer', {
      system: HUMANIZE_SYSTEM,
      messages: [{ role: 'user', content: body }],
      timeoutMs: 180_000,
      subject,
    });
    if (!edit.ok) throw new Error(`humanize: ${why(edit)}`);
    draft.markdown = stripEmDashes(`${edit.text.trimEnd()}\n\n${sourcesList(draft.sources, sources)}`.trim());
    draft.title = stripEmDashes(draft.title);
    draft.metaTitle = fit(draft.metaTitle, META_TITLE_MAX);
    draft.metaDescription = fit(draft.metaDescription, META_DESCRIPTION_MAX);

    // e is in the writer prompt; f. the gate checks it, then the numbers.
    const failed = gate({
      draft,
      sourceUrls: new Set(sources.map((s) => normUrl(s.url))),
      posts,
    });
    if (failed) throw new Error(`gate: ${failed}`);
    const check = await this.ai.run('blog_writer', {
      system: FACTCHECK_SYSTEM,
      messages: [{ role: 'user', content: `<research>\n${notes}\n</research>\n<post>\n${draft.markdown}\n</post>` }],
      outputConfig: { effort: 'low', format: { type: 'json_schema', schema: FACTCHECK_SCHEMA } },
      timeoutMs: 120_000,
      subject,
    });
    if (!check.ok) throw new Error(`fact check: ${why(check)}`);
    const unsupported = (check.json as { unsupported: string[] }).unsupported;
    if (unsupported.length) throw new Error(`gate: unsupported numbers: ${unsupported.slice(0, 5).join('; ')}`);

    // g. Publish. The OG card at /blog/<slug>/opengraph-image is the featured image.
    const post = await this.blog.create(
      {
        title: draft.title,
        slug: slugify(draft.slug || draft.title),
        excerpt: draft.excerpt,
        content: draft.markdown,
        category: draft.intent === 'compare' ? 'Comparisons' : 'Guides',
        author: BLOG_AUTHOR,
        readMinutes: Math.max(1, Math.round(wordCount(draft.markdown) / 220)),
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
        coverAlt: draft.coverAlt,
        status: BlogStatus.PUBLISHED,
      },
      null,
    );
    await this.prisma.blogQuestion.update({
      where: { id: q.id },
      data: { status: BlogQuestionStatus.PUBLISHED, postId: post.id, failReason: null },
    });
    return post.slug;
  }

  /** Queue is empty: ask for 20 new questions. Returns how many were added. */
  private refill(): Promise<number> {
    return this.suggest(
      `Suggest ${REFILL_COUNT} new questions.`,
      REFILL_COUNT,
      BlogQuestionSource.REFILL,
    );
  }

  /** Weekly learn step: posts that get clicks breed 10 related questions. */
  async learnFromSearchConsole(csv: string): Promise<{ added: number; pages: { slug: string; clicks: number }[] }> {
    const pages = topBlogPages(csv);
    if (!pages.length) throw new BadRequestException('No /blog/ pages with clicks in that file. Upload the Pages CSV from the Performance report.');
    const posts = await this.prisma.blogPost.findMany({
      where: { slug: { in: pages.map((p) => p.slug) } },
      select: { slug: true, title: true },
    });
    const winners = pages
      .map((p) => `${posts.find((x) => x.slug === p.slug)?.title ?? p.slug} (${p.clicks} clicks)`)
      .join('\n');
    const added = await this.suggest(
      `These posts get clicks from Google:\n${winners}\n\nSuggest ${LEARN_COUNT} new questions closely related to them, the follow-ups the same readers would search next.`,
      LEARN_COUNT,
      BlogQuestionSource.SEARCH_CONSOLE,
    );
    return { added, pages };
  }

  private async suggest(ask: string, count: number, source: BlogQuestionSource): Promise<number> {
    const [questions, posts] = await Promise.all([
      this.prisma.blogQuestion.findMany({ select: { question: true } }),
      this.prisma.blogPost.findMany({ select: { title: true } }),
    ]);
    const existing = [...questions.map((q) => q.question), ...posts.map((p) => p.title)];
    const r = await this.ai.run('blog_writer', {
      system: QUESTIONS_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${ask}\n\n<allowed_app_pages>${APP_PAGES.join(', ')}</allowed_app_pages>\n<existing>\n${existing.join('\n')}\n</existing>`,
        },
      ],
      outputConfig: { effort: 'low', format: { type: 'json_schema', schema: QUESTIONS_SCHEMA } },
      timeoutMs: 120_000,
      subject: `blog-questions:${source}`,
    });
    if (!r.ok) {
      this.logger.warn(`Question suggestions failed: ${r.reason}`);
      return 0;
    }
    const fresh = cleanSuggestions(r.json, existing).slice(0, count);
    await this.prisma.blogQuestion.createMany({ data: fresh.map((s) => ({ ...s, source })) });
    return fresh.length;
  }

  listQuestions() {
    return this.prisma.blogQuestion.findMany({
      orderBy: { createdAt: 'asc' },
      include: { post: { select: { slug: true, title: true } } },
    });
  }

  /** Put a FAILED question back in the queue; the next run picks it up. */
  async retryQuestion(id: string) {
    const { count } = await this.prisma.blogQuestion.updateMany({
      where: { id, status: BlogQuestionStatus.FAILED },
      data: { status: BlogQuestionStatus.QUEUED, failReason: null },
    });
    if (!count) throw new NotFoundException('No failed question with that id');
    return this.prisma.blogQuestion.findUnique({ where: { id } });
  }
}
