import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LegalClient, SaveLegalDraftDto } from './legal.dto';

/** Documents only Space operators are asked to accept. */
export const OPERATOR_ONLY = new Set(['organiser-agreement']);
/** Documents only live Unifesto Orbit Leads are asked to accept. */
export const ORBIT_ONLY = new Set(['orbit-terms']);

const SUMMARY = {
  id: true,
  slug: true,
  version: true,
  title: true,
  summary: true,
  requiresAcceptance: true,
  publishedAt: true,
} as const;

/**
 * I2: versioned legal documents. Published versions are frozen; a change is a
 * new version, drafted and then published from Apex. A user owes an acceptance
 * when the newest published version that requires one is newer than the
 * newest version they accepted; they then accept the latest published text.
 */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublished(slug: string) {
    const doc = await this.prisma.legalDocument.findFirst({
      where: { slug, publishedAt: { not: null } },
      orderBy: { version: 'desc' },
      select: { ...SUMMARY, body: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async pending(userId: string) {
    const published = await this.prisma.legalDocument.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { version: 'desc' },
      select: SUMMARY,
    });
    const latest = new Map<string, (typeof published)[number]>();
    const required = new Map<string, number>();
    for (const d of published) {
      if (!latest.has(d.slug)) latest.set(d.slug, d);
      if (d.requiresAcceptance && !required.has(d.slug)) required.set(d.slug, d.version);
    }
    if (!required.size) return [];

    const accepted = new Map<string, number>();
    for (const a of await this.prisma.legalAcceptance.findMany({
      where: { userId },
      select: { version: true, document: { select: { slug: true } } },
    })) {
      accepted.set(a.document.slug, Math.max(a.version, accepted.get(a.document.slug) ?? 0));
    }

    let owed = [...required].filter(([slug, v]) => (accepted.get(slug) ?? 0) < v).map(([slug]) => slug);
    if (owed.some((s) => ORBIT_ONLY.has(s))) {
      const lead = await this.prisma.orbitLead.count({ where: { userId, endedAt: null } });
      if (!lead) owed = owed.filter((s) => !ORBIT_ONLY.has(s));
    }
    if (owed.some((s) => OPERATOR_ONLY.has(s))) {
      const operator = await this.prisma.userRole.count({ where: { userId, spaceId: { not: null } } });
      if (!operator) return owed.filter((s) => !OPERATOR_ONLY.has(s)).map((s) => latest.get(s)!);
    }
    return owed.map((s) => latest.get(s)!);
  }

  async accept(userId: string, slug: string, version: number, client: LegalClient) {
    const doc = await this.prisma.legalDocument.findUnique({
      where: { slug_version: { slug, version } },
      select: { id: true, publishedAt: true },
    });
    if (!doc?.publishedAt) throw new NotFoundException('Document not found');
    await this.prisma.legalAcceptance.upsert({
      where: { userId_documentId: { userId, documentId: doc.id } },
      create: { userId, documentId: doc.id, version, client },
      update: {},
    });
    return { ok: true };
  }

  // ── Apex ──────────────────────────────────────────────────────────────

  listAll() {
    return this.prisma.legalDocument.findMany({
      orderBy: [{ slug: 'asc' }, { version: 'desc' }],
      select: { ...SUMMARY, updatedAt: true, _count: { select: { acceptances: true } } },
    });
  }

  async get(id: string) {
    const doc = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /** One open draft per slug: edit it if there is one, else start the next version. */
  async saveDraft(slug: string, dto: SaveLegalDraftDto) {
    const data = {
      title: dto.title,
      body: dto.body,
      summary: dto.summary || null,
      requiresAcceptance: dto.requiresAcceptance ?? false,
    };
    const draft = await this.prisma.legalDocument.findFirst({ where: { slug, publishedAt: null } });
    if (draft) return this.prisma.legalDocument.update({ where: { id: draft.id }, data });
    const last = await this.prisma.legalDocument.findFirst({ where: { slug }, orderBy: { version: 'desc' } });
    return this.prisma.legalDocument.create({ data: { ...data, slug, version: (last?.version ?? 0) + 1 } });
  }

  async publish(id: string) {
    const { count } = await this.prisma.legalDocument.updateMany({
      where: { id, publishedAt: null },
      data: { publishedAt: new Date() },
    });
    if (!count) throw new BadRequestException('Only an unpublished draft can be published');
    return this.get(id);
  }
}
