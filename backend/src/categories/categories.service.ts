import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Upload a category banner image and return its URL (not tied to a record,
   *  so it works while creating a brand-new category too). */
  async uploadBanner(file: Express.Multer.File): Promise<{ url: string }> {
    const url = await this.storage.uploadFile(file, 'categories/', randomUUID());
    return { url };
  }

  async getAll() {
    const categories = await this.prisma.eventCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, slug: true, description: true, iconUrl: true, bannerUrl: true, order: true },
    });

    // Upcoming/ongoing published events per category (soft-deleted ones
    // excluded); an event counts once in each category it's in.
    const counts = await this.prisma.$queryRaw<{ name: string; count: bigint }[]>`
      SELECT c AS name, COUNT(*) AS count
      FROM "events" e, unnest(e."categories") AS c
      WHERE e."status" = 'PUBLISHED'
        AND e."end_date_time" >= now()
        AND e."deleted_at" IS NULL
      GROUP BY c
    `;
    const countMap = new Map(counts.map((c) => [c.name, Number(c.count)]));

    return categories.map(cat => ({
      ...cat,
      event_count: countMap.get(cat.name) || 0,
    }));
  }

  async create(data: { name: string; description?: string; bannerUrl?: string; iconUrl?: string }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const maxOrder = await this.prisma.eventCategory.aggregate({ _max: { order: true } });
    return this.prisma.eventCategory.create({
      data: { ...data, slug, order: (maxOrder._max.order || 0) + 1 },
    });
  }

  /**
   * Events store category names as text, so a rename carries over to them
   * (K1); otherwise they'd drop out of the renamed category's listing.
   */
  async update(id: string, data: any) {
    if (data.name) data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const before = data.name ? await this.prisma.eventCategory.findUnique({ where: { id }, select: { name: true } }) : null;
    if (!before || before.name === data.name) return this.prisma.eventCategory.update({ where: { id }, data });
    const [updated] = await this.prisma.$transaction([
      this.prisma.eventCategory.update({ where: { id }, data }),
      this.prisma.$executeRaw`
        UPDATE "events"
        SET "category" = CASE WHEN "category" = ${before.name} THEN ${data.name} ELSE "category" END,
            "categories" = array_replace("categories", ${before.name}, ${data.name})
        WHERE "category" = ${before.name} OR ${before.name} = ANY("categories")`,
    ]);
    return updated;
  }

  async delete(id: string) {
    return this.prisma.eventCategory.update({ where: { id }, data: { isActive: false } });
  }
}
