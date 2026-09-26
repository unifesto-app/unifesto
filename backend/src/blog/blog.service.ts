import { Injectable, NotFoundException } from '@nestjs/common';
import { BlogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateBlogDto, UpdateBlogDto } from './dto';

@Injectable()
export class BlogService {
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

    return this.prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** One published post by slug (full content). */
  async getBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: BlogStatus.PUBLISHED },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // =====================================================
  // ADMIN
  // =====================================================

  async listAll() {
    return this.prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateBlogDto, adminId: string) {
    const slug = await this.uniqueSlug(dto.slug || dto.title);
    const status = (dto.status as BlogStatus) ?? BlogStatus.DRAFT;
    return this.prisma.blogPost.create({
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content,
        category: dto.category,
        author: dto.author,
        coverImageUrl: dto.coverImageUrl ?? null,
        readMinutes: dto.readMinutes ?? null,
        featured: dto.featured ?? false,
        status,
        publishedAt: status === BlogStatus.PUBLISHED ? new Date() : null,
        createdBy: adminId,
      },
    });
  }

  async update(id: string, dto: UpdateBlogDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found');

    const data: Prisma.BlogPostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) {
      data.slug = await this.uniqueSlug(dto.slug, id);
    }
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.author !== undefined) data.author = dto.author;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.readMinutes !== undefined) data.readMinutes = dto.readMinutes;
    if (dto.featured !== undefined) data.featured = dto.featured;

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
    }

    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async remove(id: string) {
    const found = await this.prisma.blogPost.count({ where: { id } });
    if (found === 0) throw new NotFoundException('Post not found');
    await this.prisma.blogPost.delete({ where: { id } });
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
