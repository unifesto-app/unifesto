import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PmTaskStatus, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const PM_STATUSES = Object.values(PmTaskStatus);

export interface TaskInput {
  key: string;
  trackKey?: string;
  title?: string;
  notes?: string | null;
  status?: PmTaskStatus;
  owner?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
}

const TOKEN_PREFIX = 'upm_';
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Product management: tracks, tasks and an append-only activity log. Shared by
 * the Apex REST controller and the Claude MCP endpoint, so both write the same
 * rows and every change carries an actor.
 */
@Injectable()
export class PmService {
  constructor(private readonly prisma: PrismaService) {}

  board() {
    return this.prisma.pmTrack.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: { tasks: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } },
    });
  }

  listTasks(filter: { trackKey?: string; status?: PmTaskStatus[] }) {
    return this.prisma.pmTask.findMany({
      where: {
        trackKey: filter.trackKey,
        status: filter.status?.length ? { in: filter.status } : undefined,
      },
      orderBy: [{ trackKey: 'asc' }, { sortOrder: 'asc' }, { key: 'asc' }],
    });
  }

  async getTask(key: string) {
    const task = await this.prisma.pmTask.findUnique({
      where: { key },
      include: { activity: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!task) throw new NotFoundException(`No task ${key}`);
    return task;
  }

  upsertTrack(key: string, name: string, sortOrder?: number) {
    return this.prisma.pmTrack.upsert({
      where: { key },
      create: { key, name, sortOrder: sortOrder ?? 0 },
      update: { name, sortOrder },
    });
  }

  /**
   * Create or update by key. A new task needs trackKey + title. Every real
   * change is logged, so the dashboard shows who moved what.
   */
  async upsertTask(input: TaskInput, actor: string) {
    const existing = await this.prisma.pmTask.findUnique({
      where: { key: input.key },
    });
    const data = {
      trackKey: input.trackKey,
      title: input.title,
      notes: input.notes,
      status: input.status,
      owner: input.owner,
      dueDate:
        input.dueDate === undefined
          ? undefined
          : input.dueDate && new Date(input.dueDate),
      sortOrder: input.sortOrder,
    };

    if (!existing) {
      if (!input.trackKey || !input.title) {
        throw new NotFoundException(
          `No task ${input.key}; give trackKey and title to create it`,
        );
      }
      const task = await this.prisma.pmTask.create({
        data: {
          ...data,
          key: input.key,
          trackKey: input.trackKey,
          title: input.title,
        },
      });
      await this.log(actor, `Created ${task.key} (${task.status})`, task.id);
      return task;
    }

    const task = await this.prisma.pmTask.update({
      where: { key: input.key },
      data,
    });
    const changes: string[] = [];
    if (input.status && input.status !== existing.status) {
      changes.push(`${existing.status} → ${input.status}`);
    }
    for (const f of ['title', 'notes', 'owner', 'trackKey'] as const) {
      if (input[f] !== undefined && input[f] !== existing[f])
        changes.push(`${f} edited`);
    }
    if (input.dueDate !== undefined)
      changes.push(`due ${input.dueDate ?? 'cleared'}`);
    if (changes.length)
      await this.log(actor, `${task.key}: ${changes.join(', ')}`, task.id);
    return task;
  }

  async addNote(actor: string, message: string, key?: string) {
    const task = key ? await this.getTask(key) : null;
    return this.log(actor, key ? `${key}: ${message}` : message, task?.id);
  }

  activity(take = 50) {
    return this.prisma.pmActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      include: { task: { select: { key: true } } },
    });
  }

  private log(actor: string, message: string, taskId?: string) {
    return this.prisma.pmActivity.create({ data: { actor, message, taskId } });
  }

  // ---------------------------------------------------------------- tokens

  listTokens(userId: string) {
    return this.prisma.pmApiToken.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns the raw token once; only its hash is stored. */
  async createToken(userId: string, name: string) {
    const raw = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const row = await this.prisma.pmApiToken.create({
      data: { userId, name, tokenHash: hash(raw) },
    });
    return { id: row.id, name: row.name, token: raw };
  }

  async revokeToken(userId: string, id: string) {
    await this.prisma.pmApiToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  /**
   * Bearer token → actor name, or null. The token's owner must still be a
   * platform ADMIN, so removing the role cuts Claude off too.
   */
  async resolveToken(
    raw: string,
  ): Promise<{ userId: string; actor: string } | null> {
    if (!raw.startsWith(TOKEN_PREFIX)) return null;
    const token = await this.prisma.pmApiToken.findUnique({
      where: { tokenHash: hash(raw) },
    });
    if (!token || token.revokedAt) return null;
    const admin = await this.prisma.userRole.findFirst({
      where: { userId: token.userId, role: { code: RoleCode.ADMIN } },
      select: { id: true },
    });
    if (!admin) return null;
    await this.prisma.pmApiToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    return { userId: token.userId, actor: `Claude (${token.name})` };
  }
}
