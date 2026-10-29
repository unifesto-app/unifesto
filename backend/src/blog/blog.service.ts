import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateBlogDto, UpdateBlogDto } from './dto';
import { blogChangeUrls, pingIndexNow } from '../common/indexnow';

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // =====================================================
  // PUBLIC
  // =====================================================

  /** Published posts, newest first, optionally filtered by category. */
  async listPublished(category?: string) {
    const where: Prisma.BlogPostWhereInput = { status: BlogStatus.PUBLISHED };
    if (category && category !== 'all') where.category = category;

    // K3: the index never shows bodies, so they stay out of the list.
    return this.prisma.blogPost.findMany({
      where,
      omit: { content: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * One published post by slug (full content). A slug the post had before a
   * rename still finds it (K3); the web redirects to the current `slug`.
   */
  async getBySlug(slug: string) {
    const post =
      (await this.prisma.blogPost.findFirst({ where: { slug, status: BlogStatus.PUBLISHED } })) ??
      (await this.prisma.blogPost.findFirst({
        where: { previousSlugs: { has: slug }, status: BlogStatus.PUBLISHED },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // =====================================================
  // ADMIN
  // =====================================================

  async listAll() {
    return this.prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** `adminId` is null for posts the auto-blog writes. */
  async create(dto: CreateBlogDto, adminId: string | null) {
    const slug = await this.uniqueSlug(dto.slug || dto.title);
    const status = (dto.status as BlogStatus) ?? BlogStatus.DRAFT;
    const post = await this.prisma.blogPost.create({
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content,
        category: dto.category,
        author: dto.author,
        coverImageUrl: dto.coverImageUrl ?? null,
        readMinutes: dto.readMinutes ?? null,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        coverAlt: dto.coverAlt ?? null,
        featured: dto.featured ?? false,
        status,
        publishedAt: status === BlogStatus.PUBLISHED ? new Date() : null,
        scheduledFor: status === BlogStatus.DRAFT && dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        createdBy: adminId,
      },
    });
    pingIndexNow(blogChangeUrls(null, post));
    return post;
  }

  async update(id: string, dto: UpdateBlogDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found');

    const data: Prisma.BlogPostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) {
      data.slug = await this.uniqueSlug(dto.slug, id);
      // K3: a post that has been public keeps answering at its old address.
      if (data.slug !== existing.slug) {
        const kept = existing.publishedAt ? [...existing.previousSlugs, existing.slug] : existing.previousSlugs;
        data.previousSlugs = [...new Set(kept)].filter((old) => old !== data.slug);
      }
    }
    if (dto.scheduledFor !== undefined) data.scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.author !== undefined) data.author = dto.author;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.readMinutes !== undefined) data.readMinutes = dto.readMinutes;
    if (dto.featured !== undefined) data.featured = dto.featured;
    if (dto.metaTitle !== undefined) data.metaTitle = dto.metaTitle;
    if (dto.metaDescription !== undefined) data.metaDescription = dto.metaDescription;
    if (dto.coverAlt !== undefined) data.coverAlt = dto.coverAlt;

    if (dto.status !== undefined) {
      const status = dto.status as BlogStatus;
      data.status = status;
      // Stamp publishedAt on the first transition to PUBLISHED; clear it when
      // a post is pulled back to DRAFT so a later re-publish re-dates it.
      if (status === BlogStatus.PUBLISHED && !existing.publishedAt) {
        data.publishedAt = new Date();
      } else if (status === BlogStatus.DRAFT) {
        data.publishedAt = null;
      }
      // Publishing by hand overrides any schedule.
      if (status === BlogStatus.PUBLISHED) data.scheduledFor = null;
    }

    const post = await this.prisma.blogPost.update({ where: { id }, data });
    pingIndexNow(blogChangeUrls(existing, post));
    return post;
  }

  /**
   * K3: publish drafts whose scheduled time has come. Every API replica runs
   * this; the conditional update flips each post once, so only the replica
   * that won pings IndexNow.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async publishScheduled(now = new Date()) {
    const due = await this.prisma.blogPost.findMany({
      where: { status: BlogStatus.DRAFT, scheduledFor: { lte: now } },
    });
    for (const post of due) {
      const { count } = await this.prisma.blogPost.updateMany({
        where: { id: post.id, status: BlogStatus.DRAFT, scheduledFor: { lte: now } },
        data: { status: BlogStatus.PUBLISHED, publishedAt: now, scheduledFor: null },
      });
      if (!count) continue;
      this.logger.log(`Published scheduled post ${post.slug}`);
      pingIndexNow(blogChangeUrls(post, { ...post, status: BlogStatus.PUBLISHED }));
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { slug: true, status: true },
    });
    if (!existing) throw new NotFoundException('Post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    pingIndexNow(blogChangeUrls(existing, null));
    return { deleted: true };
  }

  async uploadCover(file: Express.Multer.File): Promise<{ url: string }> {
    const url = await this.storage.uploadFile(file, 'blog-covers/', 'cover');
    return { url };
  }

  /**
   * A URL-safe, unique slug derived from `source`. If the base collides, a
   * numeric suffix is appended (`-2`, `-3`, …). `ignoreId` lets an update keep
   * its own slug.
   */
  private async uniqueSlug(source: string, ignoreId?: string): Promise<string> {
    const base =
      source
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200) || 'post';

    let slug = base;
    let n = 1;
    // Loop until the slug is free (excluding the row being updated).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.blogPost.findFirst({
        where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }
}
