import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyItemCategory,
  CompanyItemStatus,
  CompanyRecurrence,
  RoleCode,
} from '@prisma/client';
import type { CompanyItem, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Action, AuthorizationService } from '../auth/authorization';

export interface CompanyItemInput {
  number?: number;
  title?: string;
  category?: CompanyItemCategory;
  status?: CompanyItemStatus;
  dueDate?: string | null;
  ownerId?: string | null;
  restricted?: boolean;
  filedOn?: string | null;
  reference?: string | null;
  notes?: string | null;
  recurrence?: CompanyRecurrence;
}

/** What an item's owner may change with company:edit. Everything else needs company:manage. */
const OWNER_FIELDS = new Set([
  'number',
  'status',
  'notes',
  'filedOn',
  'reference',
]);

const MONTHS: Record<CompanyRecurrence, number> = {
  NONE: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

/**
 * Due date of the next copy of a recurring item, or null for NONE. The day is
 * clamped to the target month's length, so 31 Jan + 1 month is 28 Feb.
 * ponytail: clamping drifts (31 Jan → 28 Feb → 28 Mar); store an anchor day if
 * a month-end monthly item ever shows up.
 */
export function nextDueDate(
  due: Date,
  recurrence: CompanyRecurrence,
): Date | null {
  const months = MONTHS[recurrence];
  if (!months) return null;
  const y = due.getUTCFullYear();
  const m = due.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(due.getUTCDate(), lastDay)));
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null | undefined) =>
  s === undefined ? undefined : s && new Date(s);
const OWNER = { select: { id: true, fullName: true, username: true } } as const;

/**
 * Company obligations (U4–U5): compliance items with due dates, owners and an
 * append-only activity log. Restricted rows are invisible without
 * company:view-restricted, so the API answers 404 for them, not 403.
 */
@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  private async caller(user: User) {
    const caps = await this.authz.platformActions(user);
    return {
      id: user.id,
      actor: `${user.fullName || user.username || 'Apex user'} (apex)`,
      manage: caps.includes(Action.COMPANY_MANAGE),
      seesRestricted: caps.includes(Action.COMPANY_VIEW_RESTRICTED),
    };
  }

  async list(user: User) {
    const c = await this.caller(user);
    return this.prisma.companyItem.findMany({
      where: c.seesRestricted ? {} : { restricted: false },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }],
      include: { owner: OWNER },
    });
  }

  async get(user: User, number: number) {
    const c = await this.caller(user);
    return this.visible(number, c.seesRestricted, true);
  }

  /** Platform admins and employees: the people an item can be assigned to. */
  people() {
    return this.prisma.user.findMany({
      where: {
        roles: {
          some: {
            spaceId: null,
            eventId: null,
            role: { code: { in: [RoleCode.ADMIN, RoleCode.EMPLOYEE] } },
          },
        },
      },
      select: OWNER.select,
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * No number creates (company:manage). With a number, managers edit anything
   * and owners edit OWNER_FIELDS on their own items. Marking a recurring item
   * DONE creates the next one.
   */
  async upsert(user: User, input: CompanyItemInput) {
    const c = await this.caller(user);
    const data = {
      title: input.title,
      category: input.category,
      status: input.status,
      dueDate: toDate(input.dueDate),
      ownerId: input.ownerId,
      restricted: input.restricted,
      filedOn: toDate(input.filedOn),
      reference: input.reference,
      notes: input.notes,
      recurrence: input.recurrence,
    };

    if (input.number === undefined) {
      if (!c.manage)
        throw new ForbiddenException('Only a company manager can add items');
      if (!input.title || !input.category) {
        throw new BadRequestException(
          'A new item needs a title and a category',
        );
      }
      const item = await this.prisma.companyItem.create({
        data: { ...data, title: input.title, category: input.category },
      });
      await this.log(
        item.id,
        c.actor,
        `Created C${item.number} (${item.status})`,
      );
      return item;
    }

    const existing = await this.visible(input.number, c.seesRestricted);
    if (!c.manage) {
      if (existing.ownerId !== c.id) {
        throw new ForbiddenException('You can only update items you own');
      }
      const extra = Object.entries(input)
        .filter(([k, v]) => v !== undefined && !OWNER_FIELDS.has(k))
        .map(([k]) => k);
      if (extra.length) {
        throw new ForbiddenException(
          `Only a company manager can change ${extra.join(', ')}`,
        );
      }
    }

    const item = await this.prisma.companyItem.update({
      where: { id: existing.id },
      data,
    });
    const changes = this.diff(existing, item);
    if (changes.length) await this.log(item.id, c.actor, changes.join(', '));
    if (item.status === 'DONE' && existing.status !== 'DONE') {
      await this.spawnNext(item, c.actor);
    }
    return item;
  }

  async addNote(user: User, number: number, message: string) {
    const c = await this.caller(user);
    const item = await this.visible(number, c.seesRestricted);
    if (!c.manage && item.ownerId !== c.id) {
      throw new ForbiddenException('You can only add notes to items you own');
    }
    return this.log(item.id, c.actor, message);
  }

  private async visible(
    number: number,
    seesRestricted: boolean,
    withActivity = false,
  ) {
    const item = await this.prisma.companyItem.findFirst({
      where: { number, ...(seesRestricted ? {} : { restricted: false }) },
      include: withActivity
        ? {
            owner: OWNER,
            activity: { orderBy: { createdAt: 'desc' }, take: 50 },
          }
        : undefined,
    });
    if (!item) throw new NotFoundException(`No item C${number}`);
    return item;
  }

  private diff(before: CompanyItem, after: CompanyItem) {
    const out: string[] = [];
    if (before.status !== after.status)
      out.push(`${before.status} → ${after.status}`);
    if (day(before.dueDate) !== day(after.dueDate))
      out.push(`due ${day(after.dueDate) ?? 'cleared'}`);
    if (day(before.filedOn) !== day(after.filedOn))
      out.push(`filed ${day(after.filedOn) ?? 'cleared'}`);
    if (before.ownerId !== after.ownerId)
      out.push(after.ownerId ? 'owner changed' : 'owner cleared');
    for (const f of [
      'title',
      'category',
      'restricted',
      'reference',
      'notes',
      'recurrence',
    ] as const) {
      if (before[f] !== after[f]) out.push(`${f} edited`);
    }
    return out;
  }

  private async spawnNext(item: CompanyItem, actor: string) {
    const due = item.dueDate && nextDueDate(item.dueDate, item.recurrence);
    if (!due) return;
    // DONE → reopened → DONE again must not create a second copy.
    const already = await this.prisma.companyItem.findFirst({
      where: { title: item.title, dueDate: due },
    });
    if (already) return;
    const next = await this.prisma.companyItem.create({
      data: {
        title: item.title,
        category: item.category,
        ownerId: item.ownerId,
        restricted: item.restricted,
        notes: item.notes,
        recurrence: item.recurrence,
        dueDate: due,
      },
    });
    await this.log(
      next.id,
      actor,
      `Created from C${item.number}, repeats ${item.recurrence.toLowerCase()}`,
    );
    await this.log(
      item.id,
      actor,
      `Next one is C${next.number}, due ${day(due)}`,
    );
  }

  private log(itemId: string, actor: string, message: string) {
    return this.prisma.companyActivity.create({
      data: { itemId, actor, message },
    });
  }
}
