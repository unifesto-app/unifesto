import { Injectable, NotFoundException } from '@nestjs/common';
import { HelpArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHelpArticleDto, UpdateHelpArticleDto } from './dto';

@Injectable()
export class HelpService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // PUBLIC
  // =====================================================

  /** Published articles for the help index: no body, grouped by category client-side. */
  async listPublished() {
    return this.prisma.helpArticle.findMany({
      where: { status: HelpArticleStatus.PUBLISHED },
      select: { id: true, slug: true, title: true, category: true, updatedAt: true },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  /** One published article by slug (full body). */
  async getBySlug(slug: string) {
    const article = await this.prisma.helpArticle.findFirst({
      where: { slug, status: HelpArticleStatus.PUBLISHED },
    });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  // =====================================================
  // ADMIN
  // =====================================================

  async listAll() {
    return this.prisma.helpArticle.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async create(dto: CreateHelpArticleDto, adminId: string) {
    return this.prisma.helpArticle.create({
      data: {
        slug: await this.uniqueSlug(dto.slug || dto.title),
        title: dto.title,
        body: dto.body,
        category: dto.category,
        status: (dto.status as HelpArticleStatus) ?? HelpArticleStatus.DRAFT,
        createdBy: adminId,
      },
    });
  }

  async update(id: string, dto: UpdateHelpArticleDto) {
    const existing = await this.prisma.helpArticle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Article not found');

    const data: Prisma.HelpArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = await this.uniqueSlug(dto.slug, id);
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.status !== undefined) data.status = dto.status as HelpArticleStatus;

    return this.prisma.helpArticle.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await this.prisma.helpArticle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Article not found');
    await this.prisma.helpArticle.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * A URL-safe, unique slug derived from `source`, with a numeric suffix on
   * collision (`-2`, `-3`, …). `ignoreId` lets an update keep its own slug.
   * Same rules as BlogService.
   */
  private async uniqueSlug(source: string, ignoreId?: string): Promise<string> {
    const base =
      source
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200) || 'article';

    let slug = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.helpArticle.findFirst({
        where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }
}
