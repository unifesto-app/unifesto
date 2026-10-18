import { SlugKind } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Remember a slug an event or space is leaving, so old links still resolve. */
export async function rememberOldSlug(prisma: PrismaService, kind: SlugKind, slug: string, targetId: string) {
  await prisma.slugHistory.upsert({
    where: { kind_slug: { kind, slug } },
    create: { kind, slug, targetId },
    update: { targetId, createdAt: new Date() },
  });
}

/** The id that last used this slug, or null. Call only after a live-slug miss. */
export async function idForOldSlug(prisma: PrismaService, kind: SlugKind, slug: string): Promise<string | null> {
  const row = await prisma.slugHistory.findUnique({ where: { kind_slug: { kind, slug } }, select: { targetId: true } });
  return row?.targetId ?? null;
}
