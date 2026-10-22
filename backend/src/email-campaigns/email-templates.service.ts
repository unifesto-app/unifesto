import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailTemplateScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { sanitizeEmailHtml } from '../email/sanitize-email-html';

/**
 * CRUD for reusable email templates.
 *
 * Two scopes share one table:
 *   - GLOBAL   — the platform library. Authored by Platform Admins; every space
 *                sees these as read-only starting points.
 *   - SPACE    — private to the owning space; that space may edit/delete them.
 *
 * The service enforces ownership so a space can never mutate a GLOBAL template
 * (or another space's), and the platform side only ever touches GLOBAL rows.
 */
@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private serialiseVariables(
    variables?: string[],
  ): Prisma.InputJsonValue | undefined {
    return variables ? (variables as Prisma.InputJsonValue) : undefined;
  }

  // --- Platform (GLOBAL) ----------------------------------------------------

  listGlobal() {
    return this.prisma.emailTemplate.findMany({
      where: { scope: EmailTemplateScope.GLOBAL },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getGlobal(id: string) {
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.scope !== EmailTemplateScope.GLOBAL) {
      throw new NotFoundException('Template not found');
    }
    return tpl;
  }

  createGlobal(userId: string, dto: CreateTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        scope: EmailTemplateScope.GLOBAL,
        spaceId: null,
        name: dto.name,
        subject: dto.subject,
        body: dto.body && sanitizeEmailHtml(dto.body),
        variables: this.serialiseVariables(dto.variables),
        createdBy: userId,
      },
    });
  }

  async updateGlobal(id: string, dto: UpdateTemplateDto) {
    await this.getGlobal(id); // asserts existence + GLOBAL scope
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        subject: dto.subject,
        body: dto.body && sanitizeEmailHtml(dto.body),
        variables: this.serialiseVariables(dto.variables),
      },
    });
  }

  async deleteGlobal(id: string) {
    await this.getGlobal(id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { success: true };
  }

  // --- Space ---------------------------------------------------------------

  /** A space sees its own templates plus the GLOBAL library (read-only). */
  listForSpace(spaceId: string) {
    return this.prisma.emailTemplate.findMany({
      where: {
        OR: [{ spaceId }, { scope: EmailTemplateScope.GLOBAL }],
      },
      orderBy: [{ scope: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  /** Fetch a template usable by this space (its own or a GLOBAL one). */
  async getForSpace(id: string, spaceId: string) {
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (
      !tpl ||
      (tpl.scope !== EmailTemplateScope.GLOBAL && tpl.spaceId !== spaceId)
    ) {
      throw new NotFoundException('Template not found');
    }
    return tpl;
  }

  createForSpace(spaceId: string, userId: string, dto: CreateTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        scope: EmailTemplateScope.SPACE,
        spaceId,
        name: dto.name,
        subject: dto.subject,
        body: dto.body && sanitizeEmailHtml(dto.body),
        variables: this.serialiseVariables(dto.variables),
        createdBy: userId,
      },
    });
  }

  /** Load a template the space OWNS (GLOBAL templates are read-only here). */
  private async getOwnedBySpace(id: string, spaceId: string) {
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.spaceId !== spaceId) {
      throw new NotFoundException('Template not found');
    }
    if (tpl.scope === EmailTemplateScope.GLOBAL) {
      throw new ForbiddenException('Global templates are read-only');
    }
    return tpl;
  }

  async updateForSpace(id: string, spaceId: string, dto: UpdateTemplateDto) {
    await this.getOwnedBySpace(id, spaceId);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        subject: dto.subject,
        body: dto.body && sanitizeEmailHtml(dto.body),
        variables: this.serialiseVariables(dto.variables),
      },
    });
  }

  async deleteForSpace(id: string, spaceId: string) {
    await this.getOwnedBySpace(id, spaceId);
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { success: true };
  }
}
