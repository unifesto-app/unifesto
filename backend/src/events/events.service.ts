import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deleteWithoutMoney } from '../common/money-records';
import { StorageService } from '../storage/storage.service';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  Action,
  AuthorizationService,
} from '../auth/authorization';
import { CacheService } from '../cache/cache.service';
import { EmailService } from '../email/email.service';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { esc } from '../email/layout';
import { openCancelledEventRefunds } from '../refunds/cancelled-event-refunds';
import { PlanConfigService } from '../subscription/plan-config.service';
import { BRANDING_SPACE_SELECT, resolveEventBranding, resolveSpaceBranding } from '../white-label/branding.util';
import { buildEventIcs, IcsEventInput } from './calendar/ics.util';
import { RecurrenceService } from './recurrence/recurrence.service';
import { parseRRule, serializeRRule } from './recurrence/rrule.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { NewEventEvent } from '../notifications/notifications.events';
import {
  NOT_DELETED,
  deletedWhere,
  type DeletedFilter,
} from '../common/soft-delete';
import {
  CLAIMED_MEMBER_SEAT,
  COUNTS_AS_ATTENDING,
  IS_GROUP_BOOKING,
  IS_INDIVIDUAL_BOOKING,
  EMPTY_BREAKDOWN,
  type AttendeeBreakdown,
} from '../common/attendance';
import { validateWhatsAppInviteLink } from '../common/whatsapp-links';
import { resolveEffectiveSponsor } from '../sponsors/sponsors.util';
import {
  EventStatus,
  RoleCode,
  SpaceStatus,
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  SlugKind,
} from '@prisma/client';
import { idForOldSlug, rememberOldSlug } from '../common/slug-history';
import { assertEventSchedule } from './event-dates';
import { assertCanViewSpace } from '../spaces/space-access';
import {
  canAccessSpaceOnlyEvent,
  listableEventsWhere,
  memberSpaceIds,
} from './event-access';
import {
  CancelEventDto,
  CreateAgendaDto,
  CreateContactDto,
  CreateEventDto,
  EventTeamRole,
  CreateFaqDto,
  CreateFormFieldDto,
  CreatePrizeDto,
  CreateSpeakerDto,
  CreateTicketTypeDto,
  EventFilterDto,
  UpdateAgendaDto,
  UpdateFormFieldDto,
  UpdateContactDto,
  UpdateEventDto,
  UpdateFaqDto,
  UpdatePrizeDto,
  UpdateSpeakerDto,
  UpdateTicketTypeDto,
} from './dto';
import slugify from 'slugify';
import { resolveCategories } from './event-categories';
import {
  checkFieldDefinition,
  sanitizeConfig,
  showIfOf,
} from '../registrations/form-answers.util';

/**
 * Statuses a public list shows (a big event's hub, a space page, past events).
 * Live and finished events stay listed: a festival's past talks are still part
 * of it, and a space's history is social proof. Only drafts and cancelled
 * events drop off.
 */
const LISTED_EVENT_STATUSES: EventStatus[] = [
  EventStatus.PUBLISHED,
  EventStatus.ONGOING,
  EventStatus.COMPLETED,
];

/** Live and upcoming: the default public feed. */
const LIVE_EVENT_STATUSES: EventStatus[] = [
  EventStatus.PUBLISHED,
  EventStatus.ONGOING,
];

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly subscriptionService: SubscriptionService,
    private readonly cache: CacheService,
    private readonly emailService: EmailService,
    private readonly planConfig: PlanConfigService,
    private readonly events: EventEmitter2,
    private readonly authz: AuthorizationService,
    private readonly recurrence: RecurrenceService,
  ) {}

  /**
   * True when the user may manage an event: a Space Admin of the owning space
   * (or a Curator/Co-Curator of the event), or a Space Admin of any space that
   * co-hosts the event. Pass `eventId` to include co-host access (callers that
   * only know the space omit it).
   */
  async canManageEvent(
    userId: string,
    spaceId: string,
    eventId?: string,
  ): Promise<boolean> {
    const user = { id: userId };

    // Primary check via the central authorization layer:
    //  - with an eventId: event-scoped capability (Curator/Co-Curator) OR a
    //    Space Admin of the owning space (inheritance, money excluded);
    //  - without one (event creation): may they create events in this space?
    if (eventId) {
      if (await this.authz.can(user, Action.EVENT_EDIT, { eventId })) {
        return true;
      }
    } else if (await this.authz.can(user, Action.SPACE_CREATE_EVENT, { spaceId })) {
      return true;
    }

    // Co-host fallback: a Space Admin of any co-hosting space may also manage
    // the event. `SPACE_CREATE_EVENT` on a co-host space is exactly that check.
    if (eventId) {
      const coHostSpaces = await this.prisma.eventCoHost.findMany({
        where: { eventId },
        select: { spaceId: true },
      });
      if (
        await this.authz.canAny(
          user,
          Action.SPACE_CREATE_EVENT,
          coHostSpaces.map((c) => ({ spaceId: c.spaceId })),
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * True when the user manages an event **as its owner** — an event-scoped
   * Curator/Co-Curator, or a Space Admin of the owning space. Deliberately omits
   * the co-host fallback that `canManageEvent` applies: co-hosting an event lets
   * you help run it, but it does not make it yours. Used to decide whether a
   * sub-event attach may happen instantly (you own the child) or must be routed
   * through the owner's approval (you only co-host it).
   */
  private async canManageEventAsOwner(
    userId: string,
    eventId: string,
    ownerSpaceId: string,
  ): Promise<boolean> {
    const user = { id: userId };
    if (await this.authz.can(user, Action.EVENT_EDIT, { eventId })) return true;
    if (
      await this.authz.can(user, Action.SPACE_CREATE_EVENT, {
        spaceId: ownerSpaceId,
      })
    ) {
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Sub-events — a "big event" (parent) groups several sub-events under one
  // umbrella. Registration stays per-event; the parent is a hub page listing
  // its sub-events. Sub-events may themselves have sub-events, up to
  // MAX_SUBEVENT_DEPTH levels beneath a top-level event; both ends of any link
  // must belong to the same space and the graph must stay acyclic.
  // ---------------------------------------------------------------------------

  /**
   * How many levels of sub-events may sit beneath a top-level event. A
   * top-level event is depth 0, its sub-events depth 1, and so on, so a cap of
   * 3 permits Big event → Sub → Sub-sub → Sub-sub-sub. Bump this one number to
   * allow (or tighten) nesting; the ancestor/descendant walks are bounded by it.
   */
  private readonly MAX_SUBEVENT_DEPTH = 3;

  /**
   * Ancestor event ids of `eventId`, immediate parent first up to the root
   * (empty for a top-level event). The loop is bounded by MAX_SUBEVENT_DEPTH so
   * that even a pre-existing cycle in the data cannot spin it forever — it
   * stops walking and returns what it has seen.
   */
  private async ancestorIdsOf(eventId: string): Promise<string[]> {
    const ancestors: string[] = [];
    let currentId: string | null = eventId;
    for (let hops = 0; hops <= this.MAX_SUBEVENT_DEPTH + 1 && currentId; hops++) {
      const node: { parentEventId: string | null } | null =
        await this.prisma.event.findUnique({
          where: { id: currentId },
          select: { parentEventId: true },
        });
      const parentId = node?.parentEventId ?? null;
      if (!parentId || ancestors.includes(parentId)) break;
      ancestors.push(parentId);
      currentId = parentId;
    }
    return ancestors;
  }

  /** Card-shaped fields for a sub-event, shared by hub and management reads. */
  private readonly subEventSelect = {
    id: true,
    title: true,
    slug: true,
    description: true,
    coverImageUrl: true,
    type: true,
    status: true,
    visibility: true,
    startDateTime: true,
    endDateTime: true,
    timezone: true,
    venueName: true,
    city: true,
    isFree: true,
    capacity: true,
    registeredCount: true,
    deletedAt: true,
    // All visible+active ticket prices (not just the cheapest) so a card can
    // tell a genuinely-free event from a mixed free+paid one. Taking only the
    // cheapest hid paid tickets behind a ₹0 ticket, so mixed events read "Free".
    ticketTypes: {
      where: { isVisible: true, isActive: true },
      select: { price: true, currency: true },
      orderBy: { price: 'asc' as const },
    },
    // `childEvents` count lets a sub-event card flag that it is itself a "big
    // event" with its own sub-events, so deeper nesting is discoverable.
    _count: { select: { registrations: true, childEvents: true } },
  } satisfies Prisma.EventSelect;

  /** Slim child-ticket include used to inherit a big event's card pricing. */
  private readonly childPricingSelect = {
    where: { deletedAt: null, status: EventStatus.PUBLISHED },
    select: {
      ticketTypes: {
        where: { isVisible: true, isActive: true },
        select: { price: true, currency: true },
      },
    },
  } satisfies Prisma.Event$childEventsArgs;

  /**
   * A "big event" (parent) carries no tickets of its own — registration is
   * per sub-event — so its card would read "Free". When the event has no
   * visible tickets but has sub-events that do, inherit the sub-events' prices
   * onto the parent so the card shows the real "Starting from ₹X". Operates on
   * the slim {price,currency} card shape only, and strips `childEvents` from
   * the payload (it was only fetched to compute this).
   */
  private inheritPricingFromChildren<T extends Record<string, any>>(event: T): Omit<T, 'childEvents'> {
    const { childEvents, ...rest } = event as any;
    const own = (rest.ticketTypes ?? []) as unknown[];
    if (own.length === 0 && Array.isArray(childEvents) && childEvents.length) {
      const inherited = childEvents.flatMap((c: any) => c.ticketTypes ?? []);
      if (inherited.length) return { ...rest, ticketTypes: inherited };
    }
    return rest;
  }

  /**
   * Guards that `parentId` may legally act as a parent for an event in
   * `spaceId`. Throws with a specific message otherwise. Shared by createEvent
   * (attach on create) and attachSubEvent (attach an existing event).
   *
   * `childId` is passed when attaching an existing event so we can reject the
   * self-parent and cycle cases; omit it for brand-new events. The child is
   * always a leaf at this point (a parent event may not become a sub-event), so
   * only the parent's own depth counts against the cap.
   */
  private async assertValidParent(
    parentId: string,
    spaceId: string,
    childId?: string,
  ): Promise<void> {
    if (childId && childId === parentId) {
      throw new BadRequestException('An event cannot be its own parent');
    }

    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        spaceId: true,
        deletedAt: true,
      },
    });

    if (!parent || parent.deletedAt) {
      throw new NotFoundException('Parent event not found');
    }
    if (parent.spaceId !== spaceId) {
      // Cross-space nesting needs a co-host link between the two spaces on one
      // of the two events:
      //  (a) the child's space co-hosts the parent event, or
      //  (b) the parent's space co-hosts the child event — only checkable when
      //      attaching an existing child (a brand-new event has no co-hosts yet).
      // Either direction proves the two spaces already collaborate, so the
      // umbrella stays coherent.
      const childSpaceCoHostsParent = await this.prisma.eventCoHost.findUnique({
        where: { eventId_spaceId: { eventId: parentId, spaceId } },
        select: { id: true },
      });
      let allowed = childSpaceCoHostsParent != null;
      if (!allowed && childId) {
        const parentSpaceCoHostsChild = await this.prisma.eventCoHost.findUnique({
          where: {
            eventId_spaceId: { eventId: childId, spaceId: parent.spaceId },
          },
          select: { id: true },
        });
        allowed = parentSpaceCoHostsChild != null;
      }
      if (!allowed) {
        throw new BadRequestException(
          "A sub-event must belong to the parent's space, or the two events must be linked by a co-host relationship",
        );
      }
    }

    // Walk the parent's ancestor chain once, to enforce two things at nesting
    // depths greater than one:
    const parentAncestors = await this.ancestorIdsOf(parentId);

    // 1. No cycles. A loop would form only if the parent already sits somewhere
    //    beneath the child — i.e. the child is one of the parent's ancestors.
    if (childId && parentAncestors.includes(childId)) {
      throw new BadRequestException(
        'That event is already above this one in the hierarchy, so attaching it here would create a loop',
      );
    }

    // 2. Depth cap. The child (a leaf) lands at parent's depth + 1.
    const childDepth = parentAncestors.length + 1;
    if (childDepth > this.MAX_SUBEVENT_DEPTH) {
      throw new BadRequestException(
        `Sub-events can be nested at most ${this.MAX_SUBEVENT_DEPTH} levels deep. This parent is already as deep as it can go.`,
      );
    }
  }

  /**
   * Attach an existing event as a sub-event of `parentId`. Both must be
   * manageable by the user and live in the same space; the child must not
   * already be a parent or already attached elsewhere.
   */
  async attachSubEvent(userId: string, parentId: string, childId: string) {
    const child = await this.prisma.event.findUnique({
      where: { id: childId },
      select: {
        id: true,
        spaceId: true,
        slug: true,
        deletedAt: true,
        parentEventId: true,
        _count: { select: { childEvents: true } },
      },
    });

    if (!child || child.deletedAt) {
      throw new NotFoundException('Event not found');
    }

    // The immediate attach is only for events you *own*. Attaching an event
    // owned by another space (a co-host) onto your hub needs that space's
    // consent, so it goes through requestSubEventAttach instead — the co-host
    // fallback that would otherwise let you manage the child here is skipped on
    // purpose.
    const isOwner = await this.canManageEventAsOwner(
      userId,
      child.id,
      child.spaceId,
    );
    if (!isOwner) {
      if (await this.canManageEvent(userId, child.spaceId, child.id)) {
        throw new ForbiddenException(
          "This event belongs to another space. Send its owner a request to nest it as a sub-event — you can't attach it directly.",
        );
      }
      throw new ForbiddenException('You cannot manage this event');
    }

    await this.assertChildAttachable(child, parentId);

    const updated = await this.performSubEventAttach(child, parentId);

    this.logger.log(
      `Attached sub-event ${childId} to parent ${parentId} by ${userId}`,
    );
    return updated;
  }

  /**
   * Shared attachability guards for a would-be child event, checked both on the
   * instant path (attachSubEvent) and when an approval is accepted. `child` must
   * carry `parentEventId` and a `_count.childEvents`.
   */
  private async assertChildAttachable(
    child: {
      id: string;
      spaceId: string;
      parentEventId: string | null;
      _count: { childEvents: number };
    },
    parentId: string,
  ): Promise<void> {
    // A parent event cannot be turned into a sub-event: an event that already
    // owns sub-events must stay top-level. Nesting is built top-down — attach a
    // leaf, then give *that* its own sub-events — never by re-homing an existing
    // branch under someone else.
    if (child._count.childEvents > 0) {
      throw new BadRequestException(
        'This event already has its own sub-events, so it cannot become a sub-event of another event',
      );
    }
    if (child.parentEventId) {
      if (child.parentEventId === parentId) {
        throw new ConflictException(
          'This event is already a sub-event of that parent',
        );
      }
      throw new ConflictException(
        'This event is already a sub-event of another event. Detach it first.',
      );
    }

    // Validates the parent (exists, same space or co-host-linked) and rejects
    // self-parenting, cycles, and links that would nest deeper than
    // MAX_SUBEVENT_DEPTH. The child is always a leaf here (guarded above).
    await this.assertValidParent(parentId, child.spaceId, child.id);
  }

  /** Set the child's parent pointer and invalidate both events' caches. */
  private async performSubEventAttach(
    child: { id: string; slug: string },
    parentId: string,
  ) {
    const updated = await this.prisma.event.update({
      where: { id: child.id },
      data: { parentEventId: parentId },
      select: this.subEventSelect,
    });

    // Both pages change: the child now shows a parent breadcrumb, the parent
    // gains a card on its hub.
    await this.invalidateHierarchyCaches(parentId, child.slug);
    return updated;
  }

  /** Detach a sub-event from its parent, making it a standalone event again. */
  async detachSubEvent(userId: string, parentId: string, childId: string) {
    const child = await this.prisma.event.findUnique({
      where: { id: childId },
      select: { id: true, spaceId: true, slug: true, parentEventId: true },
    });

    if (!child) {
      throw new NotFoundException('Event not found');
    }
    if (child.parentEventId !== parentId) {
      throw new BadRequestException(
        'That event is not a sub-event of this parent',
      );
    }

    const canManage = await this.canManageEvent(userId, child.spaceId, child.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const updated = await this.prisma.event.update({
      where: { id: childId },
      data: { parentEventId: null },
      select: this.subEventSelect,
    });

    await this.invalidateHierarchyCaches(parentId, child.slug);

    this.logger.log(
      `Detached sub-event ${childId} from parent ${parentId} by ${userId}`,
    );
    return updated;
  }

  /**
   * List a parent's sub-events. `manage` (organiser view) includes drafts and
   * hidden rows; the default (public hub) returns only published, live ones.
   */
  async getSubEvents(parentId: string, manage = false, viewerId?: string) {
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: { id: true, deletedAt: true },
    });
    if (!parent || (parent.deletedAt && !manage)) {
      throw new NotFoundException('Event not found');
    }

    const where: Prisma.EventWhereInput = { parentEventId: parentId };
    if (!manage) {
      where.deletedAt = null;
      where.status = { in: LISTED_EVENT_STATUSES };
      where.AND = [
        listableEventsWhere(await memberSpaceIds(this.prisma, viewerId)),
      ];
    }

    return this.prisma.event.findMany({
      where,
      orderBy: { startDateTime: 'asc' },
      select: this.subEventSelect,
    });
  }

  /**
   * Organiser-facing sub-event list: verifies the caller manages the parent,
   * then returns every sub-event including drafts and hidden ones.
   */
  async getSubEventsForManagement(userId: string, parentId: string) {
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: { id: true, spaceId: true },
    });
    if (!parent) {
      throw new NotFoundException('Event not found');
    }
    const canManage = await this.canManageEvent(userId, parent.spaceId, parent.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }
    return this.getSubEvents(parentId, true);
  }

  // ---------------------------------------------------------------------------
  // Cross-space sub-event attach requests — a space that owns a parent event
  // asks to nest another space's event under it. The child's owning space must
  // approve (you can't pull someone else's event onto your hub unilaterally).
  // Same-space attaches never touch this flow; they stay instant.
  // ---------------------------------------------------------------------------

  /** Slim event card fields shared by attach-request reads. */
  private readonly attachEventSelect = {
    id: true,
    title: true,
    slug: true,
    coverImageUrl: true,
    startDateTime: true,
    status: true,
    space: { select: { id: true, name: true, slug: true, logoUrl: true } },
  } satisfies Prisma.EventSelect;

  /** Card-shaped fields for an attach request, shared by reads. */
  private readonly attachRequestSelect = {
    id: true,
    status: true,
    reason: true,
    createdAt: true,
    parentEvent: { select: this.attachEventSelect },
    childEvent: { select: this.attachEventSelect },
    requester: {
      select: { id: true, fullName: true, username: true, avatarUrl: true },
    },
  } satisfies Prisma.SubEventAttachRequestSelect;

  /**
   * Ask the space that owns `childId` to let it be nested as a sub-event of
   * `parentId`. The caller must own the parent (an owner-side Curator or a Space
   * Admin of the parent's space); the two events must already be linked by a
   * co-host relationship; and the child must be a standalone leaf. One PENDING
   * request per child at a time.
   */
  async requestSubEventAttach(
    userId: string,
    parentId: string,
    childId: string,
    reason?: string,
  ) {
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: { id: true, spaceId: true, deletedAt: true },
    });
    if (!parent || parent.deletedAt) {
      throw new NotFoundException('Parent event not found');
    }
    if (!(await this.canManageEventAsOwner(userId, parentId, parent.spaceId))) {
      throw new ForbiddenException(
        'Only the space that owns the parent event can request this',
      );
    }

    const child = await this.prisma.event.findUnique({
      where: { id: childId },
      select: {
        id: true,
        spaceId: true,
        slug: true,
        deletedAt: true,
        parentEventId: true,
        _count: { select: { childEvents: true } },
      },
    });
    if (!child || child.deletedAt) {
      throw new NotFoundException('Event not found');
    }

    if (child.spaceId === parent.spaceId) {
      throw new BadRequestException(
        'This event is in your own space — attach it directly, no request needed',
      );
    }

    // Reuse the shared guards: rejects a child that is already a parent or
    // already nested, self-parenting, cycles, the depth cap, and — crucially —
    // the cross-space rule that a co-host link must exist between the two events.
    await this.assertChildAttachable(child, parentId);

    const existing = await this.prisma.subEventAttachRequest.findFirst({
      where: { childEventId: childId, status: 'PENDING' },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A request to nest this event is already pending',
      );
    }

    const request = await this.prisma.subEventAttachRequest.create({
      data: {
        parentEventId: parentId,
        childEventId: childId,
        requestingSpaceId: parent.spaceId,
        ownerSpaceId: child.spaceId,
        requestedBy: userId,
        reason: reason?.trim() || null,
      },
      select: this.attachRequestSelect,
    });

    this.logger.log(
      `Sub-event attach requested: child ${childId} → parent ${parentId} by ${userId}`,
    );
    return request;
  }

  /**
   * Requests that concern this event, for its sub-events page:
   *  - `incoming`: someone wants to nest THIS event under their parent — the
   *    caller (as the owner) accepts or declines.
   *  - `outgoing`: THIS event (a parent) has asked to pull another space's event
   *    in — the caller can rescind.
   * Manager-only; only PENDING rows are surfaced.
   */
  async getSubEventAttachRequests(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.canManageEvent(userId, event.spaceId, eventId))) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const [incoming, outgoing] = await Promise.all([
      this.prisma.subEventAttachRequest.findMany({
        where: { childEventId: eventId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: this.attachRequestSelect,
      }),
      this.prisma.subEventAttachRequest.findMany({
        where: { parentEventId: eventId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: this.attachRequestSelect,
      }),
    ]);

    return { incoming, outgoing };
  }

  /** The single PENDING attach request by id, or 404. */
  private async loadPendingAttachRequest(requestId: string) {
    const request = await this.prisma.subEventAttachRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('No pending request found');
    }
    return request;
  }

  /**
   * Accept a pending request: a Space Admin of the child's owning space consents
   * and the child is nested under the parent. The world is re-checked at this
   * moment — the co-host link, the child's leaf-ness, and the depth/cycle rules
   * may all have shifted since the request was made — so a stale request is
   * closed rather than silently forcing an invalid link.
   */
  async acceptSubEventAttach(
    userId: string,
    requestId: string,
    reviewNote?: string,
  ) {
    const request = await this.loadPendingAttachRequest(requestId);

    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: request.ownerSpaceId }))) {
      throw new ForbiddenException(
        'Only a Space Admin of the owning space can accept this',
      );
    }

    const child = await this.prisma.event.findUnique({
      where: { id: request.childEventId },
      select: {
        id: true,
        spaceId: true,
        slug: true,
        deletedAt: true,
        parentEventId: true,
        _count: { select: { childEvents: true } },
      },
    });
    if (!child || child.deletedAt) {
      // The event vanished; the request can never complete. Close it.
      await this.closeAttachRequest(requestId, userId, 'CANCELLED', 'Event no longer exists');
      throw new NotFoundException('The event to nest no longer exists');
    }

    // Ownership may have moved since the request; the approver must still own it.
    if (child.spaceId !== request.ownerSpaceId) {
      await this.closeAttachRequest(requestId, userId, 'CANCELLED', 'Owner changed before acceptance');
      throw new ConflictException(
        'This event has changed hands since the request was made. Ask for a fresh one.',
      );
    }

    // Re-run every attachability guard (leaf-ness, co-host link, depth, cycles).
    // If any now fails, the offer is stale — surface the specific reason.
    await this.assertChildAttachable(child, request.parentEventId);

    const [updated] = await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id: child.id },
        data: { parentEventId: request.parentEventId },
        select: this.subEventSelect,
      }),
      this.prisma.subEventAttachRequest.update({
        where: { id: requestId },
        data: {
          status: 'ACCEPTED',
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: reviewNote?.trim() || null,
        },
      }),
    ]);

    await this.invalidateHierarchyCaches(request.parentEventId, child.slug);

    this.logger.log(
      `Sub-event attach accepted: child ${child.id} → parent ${request.parentEventId} by ${userId}`,
    );
    return updated;
  }

  /** Decline a pending request. Space Admins of the child's owning space only. */
  async declineSubEventAttach(
    userId: string,
    requestId: string,
    reviewNote?: string,
  ) {
    const request = await this.loadPendingAttachRequest(requestId);
    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: request.ownerSpaceId }))) {
      throw new ForbiddenException(
        'Only a Space Admin of the owning space can decline this',
      );
    }
    await this.closeAttachRequest(requestId, userId, 'DECLINED', reviewNote);
    return { success: true };
  }

  /**
   * Rescind a pending request. The requesting side only — a Space Admin of the
   * parent's space, or the person who made the request.
   */
  async cancelSubEventAttach(userId: string, requestId: string) {
    const request = await this.loadPendingAttachRequest(requestId);
    const allowed =
      request.requestedBy === userId ||
      (await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: request.requestingSpaceId }));
    if (!allowed) {
      throw new ForbiddenException('You cannot cancel this request');
    }
    await this.closeAttachRequest(requestId, userId, 'CANCELLED', null);
    return { success: true };
  }

  /** Stamp a terminal status + review metadata on an attach request. */
  private async closeAttachRequest(
    requestId: string,
    userId: string,
    status: 'ACCEPTED' | 'DECLINED' | 'CANCELLED',
    reviewNote?: string | null,
  ) {
    await this.prisma.subEventAttachRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote?.trim() || null,
      },
    });
  }

  /** Invalidate the parent's slug cache and the child's, after a link change. */
  private async invalidateHierarchyCaches(parentId: string, childSlug: string) {
    await Promise.all([
      this.invalidateParentCache(parentId),
      this.cache.invalidateEventCache(childSlug),
    ]);
  }

  /** Invalidate a parent event's cached hub after one of its sub-events changes. */
  private async invalidateParentCache(parentId: string) {
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: { slug: true },
    });
    if (parent) await this.cache.invalidateEventCache(parent.slug);
  }

  // ---------------------------------------------------------------------------
  // Co-hosting — invite other spaces to co-host an event. Only the owning
  // space's organisers manage co-hosts; a co-host may remove itself.
  // ---------------------------------------------------------------------------

  private readonly coHostSpaceSelect = {
    id: true,
    name: true,
    slug: true,
    logoUrl: true,
  };

  /** Card-shaped fields for a pending ownership transfer, shared by reads. */
  private readonly transferSelect = {
    id: true,
    status: true,
    reason: true,
    createdAt: true,
    fromSpace: { select: this.coHostSpaceSelect },
    toSpace: { select: this.coHostSpaceSelect },
  } satisfies Prisma.EventOwnershipTransferSelect;

  /** List the owning space and co-host spaces for an event. Manager-only. */
  async listCoHosts(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true, space: { select: this.coHostSpaceSelect } },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Owner or an existing co-host may view.
    if (!(await this.canManageEvent(userId, event.spaceId, eventId))) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const [coHosts, pendingTransfer] = await Promise.all([
      this.prisma.eventCoHost.findMany({
        where: { eventId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          createdAt: true,
          space: { select: this.coHostSpaceSelect },
        },
      }),
      // At most one PENDING transfer exists (enforced on create); surface it so
      // both the host and the target co-host can act on it from this one page.
      this.prisma.eventOwnershipTransfer.findFirst({
        where: { eventId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: this.transferSelect,
      }),
    ]);

    return { owner: event.space, coHosts, pendingTransfer };
  }

  /** Invite a space to co-host. Owning-space organisers only. */
  async addCoHost(userId: string, eventId: string, spaceId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Only the owning space's organisers may add co-hosts (omit eventId so
    // co-hosts can't invite further co-hosts).
    if (!(await this.canManageEvent(userId, event.spaceId))) {
      throw new ForbiddenException('Only the host space can manage co-hosts');
    }

    if (spaceId === event.spaceId) {
      throw new BadRequestException('The host space already owns this event');
    }

    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');

    await this.prisma.eventCoHost.upsert({
      where: { eventId_spaceId: { eventId, spaceId } },
      create: { eventId, spaceId, invitedBy: userId },
      update: {},
    });

    return { success: true };
  }

  /** Remove a co-host. The owning space's organisers, or the co-host itself. */
  async removeCoHost(userId: string, eventId: string, spaceId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const isOwner = await this.canManageEvent(userId, event.spaceId);
    const isThisCoHost = await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId });
    if (!isOwner && !isThisCoHost) {
      throw new ForbiddenException('You cannot manage this co-host');
    }

    await this.prisma.eventCoHost.deleteMany({ where: { eventId, spaceId } });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Ownership transfer — hand an event from its owning space to one of its
  // co-hosts. Two-sided: the host requests, a Space Admin of the target accepts.
  // Because Event.spaceId is the money pointer (payouts/financials roll up by
  // it) and the plan pointer (plan-gated features follow the owner's plan), the
  // move is deliberate and re-validated at accept time.
  // ---------------------------------------------------------------------------

  /** The single PENDING transfer for an event, or 404 if there isn't one. */
  private async loadPendingTransfer(eventId: string) {
    const transfer = await this.prisma.eventOwnershipTransfer.findFirst({
      where: { eventId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!transfer) {
      throw new NotFoundException('No pending ownership transfer for this event');
    }
    return transfer;
  }

  /**
   * Propose handing this event to one of its co-host spaces. Host-space Space
   * Admins only; the target must currently be a co-host; the event must not be
   * part of a sub-event hierarchy (same-space invariant); one offer at a time.
   */
  async requestOwnershipTransfer(
    userId: string,
    eventId: string,
    toSpaceId: string,
    reason?: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        spaceId: true,
        parentEventId: true,
        _count: { select: { childEvents: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: event.spaceId }))) {
      throw new ForbiddenException(
        'Only a Space Admin of the host space can transfer ownership',
      );
    }
    if (toSpaceId === event.spaceId) {
      throw new BadRequestException('This space already owns the event');
    }

    const coHost = await this.prisma.eventCoHost.findUnique({
      where: { eventId_spaceId: { eventId, spaceId: toSpaceId } },
      select: { id: true },
    });
    if (!coHost) {
      throw new BadRequestException(
        'Ownership can only be transferred to a current co-host of this event',
      );
    }

    if (event.parentEventId || event._count.childEvents > 0) {
      throw new BadRequestException(
        'Detach this event from its sub-event hierarchy before transferring ownership',
      );
    }

    const existing = await this.prisma.eventOwnershipTransfer.findFirst({
      where: { eventId, status: 'PENDING' },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'An ownership transfer is already pending for this event',
      );
    }

    const transfer = await this.prisma.eventOwnershipTransfer.create({
      data: {
        eventId,
        fromSpaceId: event.spaceId,
        toSpaceId,
        requestedBy: userId,
        reason: reason?.trim() || null,
      },
      select: this.transferSelect,
    });

    this.logger.log(
      `Ownership transfer of event ${eventId} → space ${toSpaceId} requested by ${userId}`,
    );
    return transfer;
  }

  /**
   * Accept a pending offer, moving `Event.spaceId` to the target co-host and
   * removing that space's co-host row. The former owner is dropped entirely —
   * it held no co-host row, so losing ownership already ends its access. Space
   * Admins of the receiving space only. The world is re-checked first, since
   * ownership, the co-host link, or the hierarchy may have shifted since the
   * offer was made.
   */
  async acceptOwnershipTransfer(
    userId: string,
    eventId: string,
    reviewNote?: string,
  ) {
    const transfer = await this.loadPendingTransfer(eventId);

    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: transfer.toSpaceId }))) {
      throw new ForbiddenException(
        'Only a Space Admin of the receiving space can accept this transfer',
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        slug: true,
        spaceId: true,
        parentEventId: true,
        _count: { select: { childEvents: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.spaceId !== transfer.fromSpaceId) {
      // The event already changed hands; the offer is stale. Close it.
      await this.prisma.eventOwnershipTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'CANCELLED',
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: 'Owner changed before acceptance',
        },
      });
      throw new ConflictException(
        'This event has changed hands since the offer was made. Ask for a fresh transfer.',
      );
    }
    if (event.parentEventId || event._count.childEvents > 0) {
      throw new BadRequestException(
        'This event is now part of a sub-event hierarchy. Detach it before accepting.',
      );
    }
    const stillCoHost = await this.prisma.eventCoHost.findUnique({
      where: { eventId_spaceId: { eventId, spaceId: transfer.toSpaceId } },
      select: { id: true },
    });
    if (!stillCoHost) {
      throw new ConflictException(
        'The receiving space is no longer a co-host of this event.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id: eventId },
        data: { spaceId: transfer.toSpaceId },
      }),
      this.prisma.eventCoHost.deleteMany({
        where: { eventId, spaceId: transfer.toSpaceId },
      }),
      this.prisma.eventOwnershipTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'ACCEPTED',
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: reviewNote?.trim() || null,
        },
      }),
    ]);

    // The public page shows the owning space, so its cached copy is now stale.
    await this.cache.invalidateEventCache(event.slug);

    this.logger.log(
      `Ownership of event ${eventId} transferred to space ${transfer.toSpaceId} (accepted by ${userId})`,
    );
    return { success: true };
  }

  /** Decline a pending offer. Space Admins of the receiving space only. */
  async declineOwnershipTransfer(
    userId: string,
    eventId: string,
    reviewNote?: string,
  ) {
    const transfer = await this.loadPendingTransfer(eventId);
    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: transfer.toSpaceId }))) {
      throw new ForbiddenException(
        'Only a Space Admin of the receiving space can decline this transfer',
      );
    }
    await this.prisma.eventOwnershipTransfer.update({
      where: { id: transfer.id },
      data: {
        status: 'DECLINED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote?.trim() || null,
      },
    });
    return { success: true };
  }

  /** Rescind a pending offer. Space Admins of the host (from) space only. */
  async cancelOwnershipTransfer(userId: string, eventId: string) {
    const transfer = await this.loadPendingTransfer(eventId);
    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: transfer.fromSpaceId }))) {
      throw new ForbiddenException(
        'Only a Space Admin of the host space can cancel this transfer',
      );
    }
    await this.prisma.eventOwnershipTransfer.update({
      where: { id: transfer.id },
      data: { status: 'CANCELLED', reviewedBy: userId, reviewedAt: new Date() },
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Event team — event-scoped members (volunteers/staff) who run the event.
  // ---------------------------------------------------------------------------

  private readonly teamUserSelect = {
    id: true,
    fullName: true,
    username: true,
    avatarUrl: true,
  };

  /** Loads the event (id, spaceId, slug for cache busting) or 404s; 403s unless the caller may manage it. */
  private async assertCanManageEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true, slug: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.canManageEvent(userId, event.spaceId, eventId))) {
      throw new ForbiddenException('You cannot manage this event');
    }
    return event;
  }

  /** List the event's team members (event-scoped roles). */
  async getEventTeam(userId: string, eventId: string) {
    await this.assertCanManageEvent(userId, eventId);
    const roles = await this.prisma.userRole.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: this.teamUserSelect },
        role: { select: { code: true, name: true } },
      },
    });
    const members = roles.map((r) => ({
      userRoleId: r.id,
      userId: r.userId,
      user: r.user,
      role: r.role,
    }));
    return { members };
  }

  /** Search owning-space members not yet on the event team. */
  async searchTeamCandidates(userId: string, eventId: string, q: string) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const term = (q ?? '').trim();
    if (term.length < 2) return { results: [] };

    const onTeam = await this.prisma.userRole.findMany({
      where: { eventId },
      select: { userId: true },
    });
    const excluded = onTeam.map((r) => r.userId);

    const roles = await this.prisma.userRole.findMany({
      where: {
        spaceId: event.spaceId,
        userId: { notIn: excluded.length ? excluded : undefined },
        user: {
          OR: [
            { fullName: { contains: term, mode: 'insensitive' } },
            { username: { contains: term, mode: 'insensitive' } },
            { identities: { some: { email: { contains: term, mode: 'insensitive' } } } },
          ],
        },
      },
      distinct: ['userId'],
      take: 10,
      include: { user: { select: this.teamUserSelect } },
    });
    return { results: roles.map((r) => r.user) };
  }

  /**
   * Add a user to the event team with a chosen role (Curator / Co-Curator /
   * Crew), defaulting to Crew. A user holds at most one role per event: adding
   * someone who is already on the team re-assigns their role rather than
   * erroring, so promoting a crew member to co-curator is a single call.
   */
  async addTeamMember(
    userId: string,
    eventId: string,
    targetUserId: string,
    roleCode: EventTeamRole = EventTeamRole.CREW,
  ) {
    await this.assertCanManageEvent(userId, eventId);
    // EventTeamRole is a curated subset of RoleCode with identical values; the
    // cast bridges the two enum types (DTO validation already constrained it).
    const role = await this.prisma.role.findFirst({
      where: { code: roleCode as unknown as RoleCode },
      select: { id: true },
    });
    if (!role) throw new NotFoundException(`${roleCode} role not configured`);

    // One role per user per event: any existing event-scoped grant for this
    // user is replaced (covers re-assigning a role) before the new one is
    // written.
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { eventId, userId: targetUserId },
      }),
      this.prisma.userRole.create({
        data: {
          userId: targetUserId,
          roleId: role.id,
          eventId,
          assignedBy: userId,
        },
      }),
    ]);
    return { success: true };
  }

  /** Remove a user from the event team (and clear their check-in grants). */
  async removeTeamMember(userId: string, eventId: string, targetUserId: string) {
    await this.assertCanManageEvent(userId, eventId);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { eventId, userId: targetUserId },
      }),
      this.prisma.eventCheckinAccess.deleteMany({
        where: { eventId, userId: targetUserId },
      }),
    ]);
    return { success: true };
  }

  private generateSlug(title: string): string {
    const baseSlug = slugify(title, { lower: true, strict: true });
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Validate + normalise the private attendee WhatsApp group link from a create
   * or update DTO: `undefined` = untouched, `null` = cleared (empty string), else
   * the canonical `https://chat.whatsapp.com/<code>`. Allowed on any event (a
   * sub-event can carry its own, or fall back to its parent's).
   */
  private resolveAttendeeGroupUrl(raw: string | undefined): string | null | undefined {
    if (raw === undefined) return undefined;
    const check = validateWhatsAppInviteLink(raw, 'group');
    if (!check.ok) {
      throw new BadRequestException(check.error);
    }
    return check.normalized ?? null;
  }

  /**
   * Validate + normalise a per-ticket-type WhatsApp group link. Blank (or
   * undefined) means "no ticket-specific group" → null, so the attendee falls
   * back to the event group/community. A non-WhatsApp link is rejected loudly.
   */
  private resolveTicketWhatsAppGroup(raw: string | undefined): string | null {
    if (raw === undefined || raw.trim() === '') return null;
    const check = validateWhatsAppInviteLink(raw, 'group');
    if (!check.ok) {
      throw new BadRequestException(check.error);
    }
    return check.normalized ?? null;
  }

  async createEvent(userId: string, dto: CreateEventDto) {
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (
      space.status !== SpaceStatus.APPROVED &&
      space.status !== SpaceStatus.ACTIVE
    ) {
      throw new BadRequestException('Space must be active to create events');
    }

    const canManage = await this.canManageEvent(userId, dto.spaceId);
    if (!canManage) {
      throw new ForbiddenException(
        'You must be a Space Admin of this space',
      );
    }

    // Plan limits are enforced against the SPACE's subscription now (P0.2),
    // with a transition-safe fallback to the creator's legacy row pre-P2.2.
    const subscription =
      await this.subscriptionService.getEffectiveSubscriptionForSpace(
        dto.spaceId,
      );
    if (subscription) {
      const limits = this.planConfig.getEffectiveLimits(subscription);
      if (
        limits.eventsPerMonth !== null &&
        subscription.eventsThisMonth >= limits.eventsPerMonth
      ) {
        throw new BadRequestException(
          `Event limit reached for ${subscription.plan} plan (${limits.eventsPerMonth}/month)`,
        );
      }
    }

    // A sub-event may be attached on creation. Validate the parent belongs to
    // the same space and can legally hold children before we commit anything.
    if (dto.parentEventId) {
      await this.assertValidParent(dto.parentEventId, dto.spaceId);
    }

    // Recurring series (P2). Validate the RRULE up front and enforce the v1
    // rule that a series may not also be a festival sub-event. The canonical
    // (re-serialized) form is what we store, so storage is normalized.
    let canonicalRRule: string | null = null;
    if (dto.recurrenceRule) {
      if (dto.parentEventId) {
        throw new BadRequestException(
          'A recurring series cannot also be a sub-event of a big event.',
        );
      }
      try {
        canonicalRRule = serializeRRule(parseRRule(dto.recurrenceRule));
      } catch (err) {
        throw new BadRequestException(
          `Invalid recurrence rule: ${err instanceof Error ? err.message : 'unparseable'}`,
        );
      }
    }

    assertEventSchedule(
      new Date(dto.startDateTime),
      new Date(dto.endDateTime),
      dto.timezone || 'Asia/Kolkata',
    );

    const whatsappAttendeeGroupUrl = this.resolveAttendeeGroupUrl(
      dto.whatsappAttendeeGroupUrl,
    );

    const slug = this.generateSlug(dto.title);

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        type: dto.type,
        registrationType: dto.registrationType,
        startDateTime: new Date(dto.startDateTime),
        endDateTime: new Date(dto.endDateTime),
        timezone: dto.timezone || 'Asia/Kolkata',
        venueName: dto.venueName,
        venueAddress: dto.venueAddress,
        city: dto.city,
        state: dto.state,
        country: dto.country || 'India',
        latitude: dto.latitude,
        longitude: dto.longitude,
        onlineUrl: dto.onlineUrl,
        onlinePlatform: dto.onlinePlatform,
        capacity: dto.capacity,
        waitlistEnabled: dto.waitlistEnabled || false,
        isFree: dto.isFree ?? true,
        tags: dto.tags || [],
        ...resolveCategories(dto),
        visibility: dto.visibility,
        spaceId: dto.spaceId,
        parentEventId: dto.parentEventId ?? null,
        whatsappAttendeeGroupUrl: whatsappAttendeeGroupUrl ?? null,
        // Series parent: a non-registerable template holding the RRULE. Its
        // concrete occurrences are materialized just below.
        isRecurring: canonicalRRule !== null,
        recurringRule: canonicalRRule,
        createdBy: userId,
      },
    });

    this.logger.log(`Created event ${event.id} by user ${userId}`);

    // Series occurrences are NOT materialized here — the event is created DRAFT
    // and its ticket template is still being authored; they are materialized
    // at publish time (see publishEvent), inheriting the tickets.

    return event;
  }

  async getEvents(filters: EventFilterDto) {
    const {
      city,
      type,
      category,
      startDate,
      endDate,
      search,
      spaceId,
      includeSubEvents = false,
      featured = false,
      trending = false,
      free = false,
      when = 'upcoming',
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;
    const past = when === 'past';

    const where: Prisma.EventWhereInput = {
      ...NOT_DELETED,
      // Past = ended by the clock, not only by status: the scheduler that flips
      // PUBLISHED to COMPLETED runs periodically, so a just-ended event may
      // still read PUBLISHED.
      ...(past
        ? {
            status: { in: LISTED_EVENT_STATUSES },
            endDateTime: { lt: new Date() },
          }
        : { status: { in: LIVE_EVENT_STATUSES } }),
      visibility: 'PUBLIC',
      // Series-parent templates are non-registerable; only their concrete
      // occurrences (isRecurring=false, seriesParentId set) appear in listings.
      isRecurring: false,
    };

    // Featured/trending are homepage carousels: only ever show events that
    // haven't happened yet, regardless of the default `startDateTime asc` sort.
    if (featured || trending) {
      where.startDateTime = { gte: new Date() };
    }

    // No editorial `isFeatured` column exists, so both modes derive their order
    // from existing data: `featured` = most-registered (popularity), `trending`
    // = newest first (rising). Falls back to soonest-first for the plain list.
    const orderBy: Prisma.EventOrderByWithRelationInput = featured
      ? { registeredCount: 'desc' }
      : trending
        ? { createdAt: 'desc' }
        : { startDateTime: past ? 'desc' : 'asc' };

    // Sub-events live under their parent's hub, so keep them out of the main
    // feed unless explicitly asked for. `parentEventId: null` = top-level only.
    if (!includeSubEvents) {
      where.parentEventId = null;
    }

    if (spaceId) {
      where.spaceId = spaceId;
    }
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (type) {
      where.type = type;
    }

    if (free) {
      where.ticketTypes = { none: { price: { gt: 0 } } };
    }

    if (category) {
      // Search owns `where.OR`, so this goes under AND.
      where.AND = [
        {
          OR: [
            { category: { contains: category, mode: 'insensitive' } },
            { categories: { has: category } },
          ],
        },
      ];
    }

    if (startDate) {
      where.startDateTime = { gte: new Date(startDate) };
    }

    if (endDate) {
      // Spread keeps the past view's `lt: now`.
      where.endDateTime = {
        ...(where.endDateTime as Prisma.DateTimeFilter | undefined),
        lte: new Date(endDate),
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          space: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
            },
          },
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
              avatarUrl: true,
            },
          },
          // All visible+active ticket prices (see subEventSelect) so a card can
          // distinguish free / paid / mixed instead of trusting the stale
          // `isFree` flag or the single cheapest ticket.
          ticketTypes: {
            where: { isVisible: true, isActive: true },
            select: { price: true, currency: true },
            orderBy: { price: 'asc' },
          },
          // Sub-event ticket prices, so a big event with no tickets of its own
          // inherits its children's pricing (see inheritPricingFromChildren).
          childEvents: this.childPricingSelect,
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events.map((e) => this.inheritPricingFromChildren(e)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Build the RFC-5545 `.ics` document for a single public event (calendar P1).
   *
   * Only PUBLIC + PUBLISHED events are exportable — anything else 404s, so a
   * draft/private/space-only event is never leaked through the unauthenticated
   * download route. Uses a targeted select (not the heavy cached getEventBySlug)
   * because the ICS needs only a handful of fields plus the organiser name.
   */
  async getEventIcs(slug: string): Promise<string> {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        startDateTime: true,
        endDateTime: true,
        timezone: true,
        type: true,
        venueName: true,
        venueAddress: true,
        city: true,
        onlineUrl: true,
        visibility: true,
        status: true,
        isRecurring: true,
        space: { select: { subscription: true, ...BRANDING_SPACE_SELECT } },
        creator: { select: { fullName: true } },
      },
    });

    if (
      !event ||
      event.visibility !== 'PUBLIC' ||
      event.status !== EventStatus.PUBLISHED ||
      // A series-parent template is not a real, attendable event — no .ics.
      event.isRecurring
    ) {
      throw new NotFoundException('Event not found');
    }

    const input: IcsEventInput = {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      timezone: event.timezone,
      type: event.type,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      city: event.city,
      onlineUrl: event.onlineUrl,
      organiserName: event.space?.name ?? event.creator?.fullName ?? null,
      customDomain: event.space?.subscription
        ? resolveSpaceBranding(
            event.space,
            this.planConfig.getEffectiveLimits(event.space.subscription).hasRemoveBranding,
          )?.customDomain
        : null,
    };
    return buildEventIcs(input);
  }

  /**
   * List a recurring series' materialized occurrences for the management UI.
   * Guarded like any other event management action.
   */
  async getSeriesOccurrences(userId: string, parentId: string) {
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        spaceId: true,
        isRecurring: true,
        recurringRule: true,
        seriesGeneratedUntil: true,
      },
    });
    if (!parent) throw new NotFoundException('Event not found');
    if (!parent.isRecurring) {
      throw new BadRequestException('This event is not a recurring series.');
    }
    const canManage = await this.canManageEvent(userId, parent.spaceId, parent.id);
    if (!canManage) throw new ForbiddenException('You cannot manage this event');

    const occurrences = await this.prisma.event.findMany({
      where: { seriesParentId: parentId },
      orderBy: { startDateTime: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        status: true,
        registeredCount: true,
        seriesDetached: true,
      },
    });
    return {
      seriesId: parent.id,
      recurrenceRule: parent.recurringRule,
      generatedUntil: parent.seriesGeneratedUntil,
      occurrences,
    };
  }

  /**
   * Detach one occurrence from its series ("this occurrence" edit scope, D3):
   * a subsequent whole-series propagation/regeneration will never touch it.
   * The occurrence is then edited through the normal update path.
   */
  async detachOccurrenceFromSeries(userId: string, occurrenceId: string) {
    const occ = await this.prisma.event.findUnique({
      where: { id: occurrenceId },
      select: { id: true, spaceId: true, seriesParentId: true },
    });
    if (!occ) throw new NotFoundException('Event not found');
    if (!occ.seriesParentId) {
      throw new BadRequestException('This event is not part of a series.');
    }
    const canManage = await this.canManageEvent(userId, occ.spaceId, occ.id);
    if (!canManage) throw new ForbiddenException('You cannot manage this event');
    await this.recurrence.detachOccurrence(occurrenceId);
    return { id: occurrenceId, seriesDetached: true };
  }

  /**
   * Public event read. Drafts are only served to people who can already see
   * the event in an operator app — the slug alone must not unlock them. Runs
   * on both the cache and DB paths (the cache is keyed by slug, not viewer).
   */
  async getEventBySlug(slug: string, viewerId?: string) {
    const event = await this.loadEventBySlug(slug);
    if (
      (event.status === EventStatus.DRAFT || event.deletedAt) &&
      !(await this.canViewUnpublishedEvent(event, viewerId))
    ) {
      // Same 404 as a missing event so draft (and hidden) slugs can't be
      // probed: "hidden" is private housekeeping, invisible from outside.
      throw new NotFoundException('Event not found');
    }
    // Space-only events: members of a hosting space (or existing ticket
    // holders) only. Operators are members by definition.
    if (!(await canAccessSpaceOnlyEvent(this.prisma, event, viewerId))) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private async canViewUnpublishedEvent(
    event: { id: string; spaceId: string },
    viewerId?: string,
  ): Promise<boolean> {
    if (!viewerId) return false;
    return (
      (await this.authz.can({ id: viewerId }, Action.EVENT_VIEW, {
        eventId: event.id,
      })) || (await this.canManageEvent(viewerId, event.spaceId, event.id))
    );
  }

  /**
   * The cached event payload lives up to 10 minutes; seat counts must not
   * (A31). One small query overlays the live sold / registered / waitlist
   * counts so "seats left" and sold-out are always current.
   */
  private async withLiveCounts(event: any) {
    const live = await this.prisma.event.findUnique({
      where: { id: event.id },
      select: {
        registeredCount: true,
        waitlistCount: true,
        ticketTypes: { select: { id: true, soldCount: true, totalQuantity: true } },
      },
    });
    if (!live) return event;
    const byId = new Map(live.ticketTypes.map((t) => [t.id, t]));
    return {
      ...event,
      registeredCount: live.registeredCount,
      waitlistCount: live.waitlistCount,
      ticketTypes: (event.ticketTypes ?? []).map((tt: any) =>
        byId.has(tt.id) ? { ...tt, ...byId.get(tt.id) } : tt,
      ),
    };
  }

  private async loadEventBySlug(slug: string) {
    // Check cache first
    const cachedEvent = await this.cache.getCachedEvent(slug);
    if (cachedEvent) {
      // Increment view count in background
      await this.cache.incrementEventViews(cachedEvent.id);
      return this.withLiveCounts(cachedEvent);
    }

    // Try to find by slug first, then fall back to ID
    let event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        space: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            bannerUrl: true,
            visibility: true,
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
        ticketTypes: {
          where: { isVisible: true, isActive: true },
          orderBy: { order: 'asc' },
          include: {
            // Ticket types that block this one (if the user holds any of them,
            // this ticket is unavailable) and the ones it blocks in turn.
            blockedBy: { select: { blockerId: true } },
            blocks: { select: { blockedId: true } },
          },
        },
        agenda: {
          orderBy: { order: 'asc' },
        },
        speakers: {
          orderBy: { order: 'asc' },
        },
        prizes: {
          orderBy: { order: 'asc' },
        },
        contacts: {
          orderBy: { order: 'asc' },
        },
        faqs: {
          orderBy: { order: 'asc' },
        },
        formFields: {
          orderBy: { order: 'asc' },
        },
        // Parent breadcrumb (if this event is itself a sub-event) and the hub
        // of published sub-events (if this event is a parent).
        parentEvent: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImageUrl: true,
            startDateTime: true,
          },
        },
        childEvents: {
          where: { deletedAt: null, status: { in: LISTED_EVENT_STATUSES } },
          orderBy: { startDateTime: 'asc' },
          select: this.subEventSelect,
        },
        _count: {
          select: {
            registrations: true,
          },
        },
      },
    });

    // If not found by slug, try by ID (for backwards compatibility).
    // Only attempt this if the value actually looks like a UUID — otherwise the
    // raw DB driver throws an unhandled "invalid input syntax for type uuid" error.
    // A renamed event: its old slug resolves to the event (B16); the client
    // sees the new slug in the payload and can redirect to it.
    if (!event) slug = (await idForOldSlug(this.prisma, SlugKind.EVENT, slug)) ?? slug;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    if (!event && isUuid) {
      event = await this.prisma.event.findUnique({
        where: { id: slug },
        include: {
          space: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              bannerUrl: true,
              visibility: true,
            },
          },
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
              avatarUrl: true,
            },
          },
          ticketTypes: {
            where: { isVisible: true, isActive: true },
            orderBy: { order: 'asc' },
            include: {
              blockedBy: { select: { blockerId: true } },
              blocks: { select: { blockedId: true } },
            },
          },
          agenda: {
            orderBy: { order: 'asc' },
          },
          speakers: {
            orderBy: { order: 'asc' },
          },
          prizes: {
            orderBy: { order: 'asc' },
          },
          contacts: {
            orderBy: { order: 'asc' },
          },
          faqs: {
            orderBy: { order: 'asc' },
          },
          formFields: {
            orderBy: { order: 'asc' },
          },
          parentEvent: {
            select: {
              id: true,
              title: true,
              slug: true,
              coverImageUrl: true,
              startDateTime: true,
            },
          },
          childEvents: {
            where: { deletedAt: null, status: { in: LISTED_EVENT_STATUSES } },
            orderBy: { startDateTime: 'asc' },
            select: this.subEventSelect,
          },
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      });
    }

    // A hidden event is kept here and 404'd in getEventBySlug for everyone but
    // its operators, who need it to restore or delete it (B15).
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // SECURITY: this endpoint is public (no auth guard) and also serves the
    // operator apps by UUID, so the WhatsApp invite link must never ride on it.
    // The private attendee group is surfaced only through JWT-guarded
    // per-registration endpoints. The operator WhatsApp page loads/edits these
    // via GET/PATCH /events/:id/whatsapp.
    delete (event as any).whatsappAttendeeGroupUrl;
    for (const tt of (event as any).ticketTypes ?? []) {
      delete tt.whatsappGroupUrl;
    }

    // Attendee-facing theme: the owning space's (see resolveEventBranding),
    // with the event's own accent override. One small extra query, only on a
    // cache miss; branding writes bust this cache.
    const owner = await this.prisma.space.findUnique({
      where: { id: event.spaceId },
      select: { subscription: true, ...BRANDING_SPACE_SELECT },
    });
    const subscription = owner?.subscription ?? null;
    const hasRemoveBranding = subscription
      ? this.planConfig.getEffectiveLimits(subscription).hasRemoveBranding
      : false;
    (event as any).branding = resolveEventBranding(event as any, owner, hasRemoveBranding);

    // Attendee-facing "Curated by" list: the event's Curators and Co-Curators
    // only. Space Admins run the space but are never surfaced here, and Crew is
    // internal check-in staff — so both are excluded. Only a clean public shape
    // (id, name, avatar, role code) leaves the API. Runs on cache miss, then
    // rides along in the cached event object.
    const curatorRoles = await this.prisma.userRole.findMany({
      where: {
        eventId: event.id,
        role: { code: { in: [RoleCode.CURATOR, RoleCode.CO_CURATOR] } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: this.teamUserSelect },
        role: { select: { code: true } },
      },
    });
    (event as any).curators = curatorRoles.map((r) => ({
      id: r.user.id,
      fullName: r.user.fullName,
      username: r.user.username,
      avatarUrl: r.user.avatarUrl,
      roleCode: r.role.code,
    }));

    // Co-hosting spaces, for the attendee-facing "by <host> & <co-host>" credit.
    // Only the co-host spaces themselves (id/name/slug/logo) are surfaced — the
    // owning space is already `event.space`. Runs on cache miss, then rides
    // along in the cached event object like `curators` above.
    const coHostLinks = await this.prisma.eventCoHost.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
      select: { space: { select: this.coHostSpaceSelect } },
    });
    (event as any).coHosts = coHostLinks.map((c) => c.space);

    // Public sponsor display: every sponsor attached to this event, flattened to
    // its effective (roster + per-event override) shape and ordered by tier rank
    // then placement. Rides along in the cached event, so the cache is busted on
    // any sponsor change (see SponsorsService). `leadCaptureEnabled` tells the
    // client whether to offer the attendee "I'm interested" opt-in button.
    const eventSponsorRows = await this.prisma.eventSponsor.findMany({
      where: { eventId: event.id },
      include: { sponsor: true, tier: true },
      orderBy: [{ tier: { rank: 'asc' } }, { order: 'asc' }],
    });
    (event as any).sponsors = eventSponsorRows.map(resolveEffectiveSponsor);

    // Cache under the canonical slug only. Lookups by UUID (organiser apps,
    // the registration screen) therefore always read fresh from the DB, while
    // slug-based public reads stay cached and are invalidated on every edit —
    // so newly added/edited ticket form questions and options show up at once.
    await this.cache.setCachedEvent(event.slug, event);
    await this.cache.incrementEventViews(event.id);

    return event;
  }

  /**
   * The WhatsApp invite config for the operator WhatsApp page. Capability-gated
   * (`canManageEvent`) — the private attendee group is stripped from the public
   * event payload, so this authenticated endpoint is the only place the operator
   * reads it. Returns the event-level attendee group, the inherited parent group
   * (read-only, for a sub-event with none of its own), and every ticket type's
   * per-tier override (blank when unset).
   */
  async getEventWhatsAppConfig(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        spaceId: true,
        parentEventId: true,
        whatsappAttendeeGroupUrl: true,
        parentEvent: { select: { whatsappAttendeeGroupUrl: true } },
        ticketTypes: {
          orderBy: { order: 'asc' },
          select: { id: true, name: true, whatsappGroupUrl: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    return {
      whatsappAttendeeGroupUrl: event.whatsappAttendeeGroupUrl,
      // Where invites fall back to when this sub-event sets no group of its own.
      parentAttendeeGroupUrl: event.parentEventId
        ? (event.parentEvent?.whatsappAttendeeGroupUrl ?? null)
        : null,
      ticketTypes: event.ticketTypes.map((t) => ({
        id: t.id,
        name: t.name,
        whatsappGroupUrl: t.whatsappGroupUrl,
      })),
    };
  }

  async updateEvent(userId: string, eventId: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { space: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cannot update cancelled event');
    }

    // Absorbing the buyer fee cuts the organiser's take, so it is a money
    // decision (A33): event money (Curator) or space money (Space Admin) only.
    if (
      dto.absorbProcessingFee !== undefined &&
      dto.absorbProcessingFee !== event.absorbProcessingFee &&
      !(
        (await this.authz.can({ id: userId }, Action.EVENT_MANAGE_MONEY, { eventId })) ||
        (await this.authz.can({ id: userId }, Action.SPACE_MANAGE_MONEY, { spaceId: event.spaceId }))
      )
    ) {
      throw new ForbiddenException('Only the Curator or a Space Admin can change who pays the processing fee');
    }

    // The schedule as it will be after this edit (B17). The far-future check
    // only applies when the start itself moves.
    if (dto.startDateTime || dto.endDateTime || dto.timezone) {
      assertEventSchedule(
        dto.startDateTime ? new Date(dto.startDateTime) : event.startDateTime,
        dto.endDateTime ? new Date(dto.endDateTime) : event.endDateTime,
        dto.timezone || event.timezone,
        { checkLead: !!dto.startDateTime },
      );
    }

    // Slug edits: normalise, then enforce global uniqueness (a unique index
    // also guards this, but we surface a friendly error first).
    let nextSlug: string | undefined;
    if (dto.slug !== undefined && dto.slug !== event.slug) {
      nextSlug = slugify(dto.slug, { lower: true, strict: true });
      if (!nextSlug) {
        throw new BadRequestException('Slug cannot be empty');
      }
      const clash = await this.prisma.event.findUnique({
        where: { slug: nextSlug },
      });
      if (clash && clash.id !== eventId) {
        throw new ConflictException('That slug is already taken');
      }
    }

    const whatsappAttendeeGroupUrl = this.resolveAttendeeGroupUrl(
      dto.whatsappAttendeeGroupUrl,
    );

    // Recurrence edit (series parent only). Validate a changed RRULE up front so
    // an invalid rule is a clean 400 before anything is written.
    let canonicalRRule: string | undefined;
    let ruleChanged = false;
    if (dto.recurrenceRule !== undefined) {
      if (!event.isRecurring) {
        throw new BadRequestException(
          'Recurrence can only be edited on a recurring series.',
        );
      }
      try {
        canonicalRRule = serializeRRule(parseRRule(dto.recurrenceRule));
      } catch (err) {
        throw new BadRequestException(
          `Invalid recurrence rule: ${err instanceof Error ? err.message : 'unparseable'}`,
        );
      }
      ruleChanged = canonicalRRule !== event.recurringRule;
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        title: dto.title,
        slug: nextSlug,
        recurringRule: canonicalRRule,
        // Editing a single occurrence individually detaches it, so a later
        // whole-series propagation/regeneration never overwrites it (D3).
        seriesDetached: event.seriesParentId ? true : undefined,
        description: dto.description,
        type: dto.type,
        registrationType: dto.registrationType,
        startDateTime: dto.startDateTime
          ? new Date(dto.startDateTime)
          : undefined,
        endDateTime: dto.endDateTime ? new Date(dto.endDateTime) : undefined,
        timezone: dto.timezone,
        venueName: dto.venueName,
        venueAddress: dto.venueAddress,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        onlineUrl: dto.onlineUrl,
        onlinePlatform: dto.onlinePlatform,
        capacity: dto.capacity,
        waitlistEnabled: dto.waitlistEnabled,
        absorbProcessingFee: dto.absorbProcessingFee,
        isFree: dto.isFree,
        tags: dto.tags,
        ...resolveCategories(dto, event),
        visibility: dto.visibility,
        whatsappAttendeeGroupUrl,
      },
    });

    // Invalidate event cache
    await this.cache.invalidateEventCache(event.slug);
    // Card fields shown on the parent's hub (title, date, venue) may have
    // changed, so refresh the parent too.
    if (event.parentEventId) {
      await this.invalidateParentCache(event.parentEventId);
    }

    // Keep the old slug resolving, so shared links and QR codes survive (B16).
    if (nextSlug && nextSlug !== event.slug) {
      await rememberOldSlug(this.prisma, SlugKind.EVENT, event.slug, eventId);
    }

    // Recurring series parent edit: reconcile the occurrences (D3/D4). A schedule
    // change (rule, start, or end) regenerates future unregistered occurrences
    // from the updated parent; a content-only edit propagates the safe fields to
    // them. Registered and individually-detached occurrences are always spared.
    if (updated.isRecurring) {
      const scheduleChanged =
        ruleChanged ||
        (dto.startDateTime != null &&
          updated.startDateTime.getTime() !== event.startDateTime.getTime()) ||
        (dto.endDateTime != null &&
          updated.endDateTime.getTime() !== event.endDateTime.getTime());
      try {
        if (scheduleChanged) {
          await this.recurrence.regenerateSeries(eventId);
        } else {
          await this.recurrence.propagateToFutureOccurrences(eventId, {
            title: updated.title,
            description: updated.description,
            type: updated.type,
            registrationType: updated.registrationType,
            timezone: updated.timezone,
            venueName: updated.venueName,
            venueAddress: updated.venueAddress,
            city: updated.city,
            state: updated.state,
            country: updated.country,
            latitude: updated.latitude,
            longitude: updated.longitude,
            onlineUrl: updated.onlineUrl,
            onlinePlatform: updated.onlinePlatform,
            capacity: updated.capacity,
            waitlistEnabled: updated.waitlistEnabled,
            isFree: updated.isFree,
            tags: updated.tags,
            category: updated.category,
            categories: updated.categories,
            visibility: updated.visibility,
          });
        }
      } catch (err) {
        this.logger.error(
          `Series reconcile after edit failed for ${eventId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Check if significant fields changed and notify registered attendees
    const significantChanges: { field: string; oldValue: string; newValue: string }[] = [];

    if (dto.startDateTime && updated.startDateTime.getTime() !== event.startDateTime.getTime()) {
      significantChanges.push({
        field: 'Date & Time',
        oldValue: this.formatEventDate(event.startDateTime),
        newValue: this.formatEventDate(updated.startDateTime),
      });
    }

    if (dto.venueName && updated.venueName !== event.venueName) {
      significantChanges.push({
        field: 'Venue',
        oldValue: event.venueName || 'TBD',
        newValue: updated.venueName || 'TBD',
      });
    }

    if (significantChanges.length > 0 && event.status === EventStatus.PUBLISHED) {
      // Notify everyone attending, group members included (non-blocking)
      for (const r of await this.attendeeRecipients(eventId)) {
        if (r.email) {
          this.emailService
            .sendEventUpdated({
              email: r.email,
              userName: r.name,
              eventId: updated.id,
              eventTitle: updated.title,
              changes: significantChanges,
              newDate: this.formatEventDate(updated.startDateTime),
              newTime: this.formatEventTime(updated.startDateTime, updated.endDateTime),
              newVenue: updated.venueName || undefined,
            })
            .catch((err) => this.logger.error('Failed to send event updated email', err));
        }
      }
    }

    return updated;
  }

  /**
   * Hide a finished event without destroying it.
   *
   * Only COMPLETED and CANCELLED events qualify: both are over, so hiding one
   * takes nothing away from anybody. A DRAFT has nothing worth preserving (use
   * permanent delete), and a PUBLISHED or ONGOING event still has attendees
   * relying on it — hiding one would strand ticket holders with no refund and
   * no notice, which is why the organiser has to cancel it first.
   *
   * Everything hanging off the event — registrations, tickets, payments,
   * payouts — is left completely untouched and comes back intact on restore.
   */
  async softDeleteEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.deletedAt) {
      throw new BadRequestException('This event is already hidden');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot hide this event');
    }

    if (
      event.status !== EventStatus.COMPLETED &&
      event.status !== EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        event.status === EventStatus.ONGOING
          ? 'This event is running right now and cannot be hidden. Wait for it to finish, or cancel it first.'
          : 'Only completed or cancelled events can be hidden. Cancel the event first.',
      );
    }

    const hidden = await this.prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    // A cached copy would keep serving the event to the public after it was
    // hidden, which is precisely what hiding is meant to stop.
    await this.cache.invalidateEventCache(event.slug);

    return hidden;
  }

  /** Bring a hidden event back. Everything reappears exactly as it was. */
  async restoreEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!event.deletedAt) {
      throw new BadRequestException('This event is not hidden');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot restore this event');
    }

    const restored = await this.prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: null, deletedBy: null },
    });

    await this.cache.invalidateEventCache(event.slug);

    return restored;
  }

  /**
   * Destroy an event and everything that cascades from it. Irreversible.
   *
   * Never allowed for a COMPLETED event: it happened, people attended and paid,
   * and that record is not the organiser's to erase. Hide it instead. The same
   * reasoning blocks PUBLISHED and ONGOING events, which must be cancelled
   * first — leaving DRAFT (nothing of value) and CANCELLED (called off, nobody
   * attended) as the only states that can truly be deleted.
   */
  async permanentDeleteEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot delete this event');
    }

    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException(
        'A completed event cannot be permanently deleted — its attendance and payment records must be kept. Hide it instead.',
      );
    }

    // A published event must be cancelled first; only drafts and cancelled
    // events can be removed. (The UI mirrors this.)
    if (
      event.status !== EventStatus.DRAFT &&
      event.status !== EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only draft or cancelled events can be deleted. Cancel the event first.',
      );
    }

    // Payments, refunds and payouts are financial records: refused while any
    // exist (S14, A29). Hide it instead.
    const deleted = await deleteWithoutMoney(
      this.prisma,
      { event: { id: eventId } },
      'This event has payment, refund or payout records and cannot be deleted. Hide it instead.',
      (tx) => tx.event.delete({ where: { id: eventId } }),
    );

    // Clear any cached copy of the (previously published/cancelled) event.
    await this.cache.invalidateEventCache(event.slug);

    return deleted;
  }

  async publishEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { space: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot publish this event');
    }

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException('Event is already published');
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: EventStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: { space: true },
    });

    await this.subscriptionService.incrementEventUsageForSpace(event.spaceId);

    // A recurring series materializes its occurrences now — the parent is
    // PUBLISHED and its ticket template is final, so each occurrence inherits
    // the finished tickets. Idempotent + non-blocking.
    if (updated.isRecurring) {
      try {
        const created = await this.recurrence.generateOccurrences(eventId);
        this.logger.log(`Series ${eventId}: materialized ${created} occurrence(s) on publish`);
      } catch (err) {
        this.logger.error(
          `Failed to materialize series ${eventId} on publish: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Invalidate event cache
    await this.cache.invalidateEventCache(event.slug);
    // A newly published sub-event should appear on its parent's hub at once.
    if (event.parentEventId) {
      await this.invalidateParentCache(event.parentEventId);
    }

    this.logger.log(`Published event ${eventId}`);

    // Send event published emails to space members (non-blocking)
    const spaceMembers = await this.prisma.userRole.findMany({
      where: { spaceId: event.spaceId },
      include: {
        user: {
          include: {
            identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
          },
        },
      },
    });

    const optedOut = await emailOptedOutUserIds(
      this.prisma,
      spaceMembers.map((m) => m.userId),
    );

    for (const member of spaceMembers) {
      const memberEmail = member.user.identities[0]?.email;
      if (memberEmail && !optedOut.has(member.userId)) {
        this.emailService
          .sendEventPublished({
            email: memberEmail,
            userName: member.user.fullName || member.user.username || 'there',
            eventTitle: updated.title,
            eventDate: this.formatEventDate(updated.startDateTime),
            eventTime: this.formatEventTime(updated.startDateTime, updated.endDateTime),
            venueName: updated.venueName || undefined,
            city: updated.city || undefined,
            isOnline: updated.type === 'ONLINE',
            spaceName: updated.space.name,
            registrationUrl: `https://unifesto.app/event/${updated.slug}`,
          })
          .catch((err) => this.logger.error('Failed to send event published email', err));
      }
    }

    // Offline push to space members (best-effort, decoupled). Reuses the same
    // audience as the published email; the publisher themselves is excluded.
    const recipientUserIds = [
      ...new Set(spaceMembers.map((m) => m.userId).filter((id) => id !== userId)),
    ];
    if (recipientUserIds.length) {
      this.events.emit(NotificationEvents.NewEvent, {
        eventId: updated.id,
        eventTitle: updated.title,
        eventSlug: updated.slug,
        spaceId: updated.spaceId,
        recipientUserIds,
      } satisfies NewEventEvent);
    }

    return updated;
  }

  /**
   * Who to mail about a change to an event: the holder of every attending
   * booking (with the row, for refund lines) plus group members who claimed a
   * seat. One entry per person, primary email first.
   */
  private async attendeeRecipients(eventId: string) {
    const person = {
      id: true,
      fullName: true,
      username: true,
      identities: {
        where: { email: { not: null } },
        orderBy: { isPrimary: 'desc' as const },
        select: { email: true },
        take: 1,
      },
    };
    const regs = await this.prisma.eventRegistration.findMany({
      where: { eventId, ...COUNTS_AS_ATTENDING },
      include: {
        user: { select: person },
        groupSeats: { where: CLAIMED_MEMBER_SEAT, select: { claimedBy: { select: person } } },
      },
    });
    const out = new Map<string, { email: string | null; name: string; reg: (typeof regs)[number] | null }>();
    const add = (
      u: { id: string; fullName: string | null; username: string | null; identities: { email: string | null }[] } | null,
      reg: (typeof regs)[number] | null,
    ) => {
      if (!u || out.has(u.id)) return;
      out.set(u.id, { email: u.identities[0]?.email ?? null, name: u.fullName || u.username || 'there', reg });
    };
    for (const reg of regs) add(reg.user, reg);
    for (const reg of regs) for (const seat of reg.groupSeats ?? []) add(seat.claimedBy, null);
    return [...out.values()];
  }

  async cancelEvent(userId: string, eventId: string, dto: CancelEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot cancel this event');
    }

    // Only a live event can be cancelled (A24): a repeat cancel would re-email
    // everyone, and a completed one could then be hard-deleted with its money.
    const claimed = await this.prisma.event.updateMany({
      where: { id: eventId, status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] } },
      data: {
        status: EventStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Only a published or ongoing event can be cancelled');
    }
    const updated = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });

    // Every paid ticket gets its price back: one refund request each, straight
    // to Unifesto. The money is held from payouts until they settle.
    const opened = await openCancelledEventRefunds(this.prisma, eventId, userId, dto.reason);
    if (opened > 0) {
      this.emailService
        .sendRawEmail(
          process.env.ADMIN_EMAIL || 'aws@unifesto.app',
          `${opened} refunds waiting: ${event.title} was cancelled`,
          `<p>${esc(event.title)} was cancelled, so ${opened} paid ${opened === 1 ? 'booking needs' : 'bookings need'} a refund. Send them from Apex: Events, ${esc(event.title)}, Refund all paid.</p>`,
        )
        .catch((err) => this.logger.error('Failed to send cancelled-event refunds notice', err));
    }

    // Invalidate event cache
    await this.cache.invalidateEventCache(event.slug);

    // Cancellation emails to everyone attending, group members included. Only
    // the booking holder paid, so only they get the refund line (non-blocking).
    for (const { email: attendeeEmail, name, reg } of await this.attendeeRecipients(eventId)) {
      if (attendeeEmail) {
        const paid =
          !!reg &&
          Number(reg.razorpayAmount) > 0 &&
          (reg.paymentStatus === 'PAID' || reg.paymentStatus === 'PARTIALLY_REFUNDED');
        const base = paid
          ? Math.max(0, Number(reg.totalAmount) - Number(reg.processingFee) - Number(reg.refundedAmount))
          : 0;
        const refundInfo = paid
          ? `Your ticket price of ₹${base.toLocaleString('en-IN')} is coming back to the card or account you paid with. ` +
            'It can take 5-7 business days to show once sent. The processing fee is not refunded.'
          : undefined;

        this.emailService
          .sendEventCancelled({
            email: attendeeEmail,
            userName: name,
            eventId: event.id,
            eventTitle: event.title,
            eventDate: this.formatEventDate(event.startDateTime),
            cancellationReason: dto.reason || undefined,
            refundInfo,
          })
          .catch((err) => this.logger.error('Failed to send event cancelled email', err));
      }
    }

    // Sub-events can't run without their parent: cancel the live ones too.
    const children = await this.prisma.event.findMany({
      where: { parentEventId: eventId, status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] } },
      select: { id: true },
    });
    for (const child of children) {
      await this.cancelEvent(userId, child.id, dto).catch((err) =>
        this.logger.error(`Cancelling sub-event ${child.id} of ${eventId} failed`, err),
      );
    }

    return updated;
  }

  async uploadCoverImage(
    userId: string,
    eventId: string,
    file: Express.Multer.File,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot update this event');
    }

    const uploadResult = await this.storageService.uploadFile(
      file,
      'events/',
      eventId,
    );

    return this.prisma.event.update({
      where: { id: eventId },
      data: { coverImageUrl: uploadResult },
    });
  }

  /**
   * Events belonging to (or co-hosted by) a space.
   *
   * `deleted` selects which side of the soft-delete line to return: 'active'
   * (the default) for the normal list, 'deleted' for the organiser's trash view
   * where hidden events are restored or purged.
   */
  /**
   * Can this viewer see a space's drafts / hidden events? Space Admins (via
   * SPACE_VIEW) plus anyone holding an operator role on one of its events, so
   * event-scoped Curators keep seeing the list they manage.
   */
  private async isSpaceInsider(
    viewerId: string | undefined,
    spaceId: string,
  ): Promise<boolean> {
    if (!viewerId) return false;
    if (await this.authz.can({ id: viewerId }, Action.SPACE_VIEW, { spaceId })) {
      return true;
    }
    const eventRole = await this.prisma.userRole.findFirst({
      where: {
        userId: viewerId,
        event: { spaceId },
        role: {
          code: {
            in: [RoleCode.CURATOR, RoleCode.CO_CURATOR, RoleCode.CREW],
          },
        },
      },
      select: { id: true },
    });
    return !!eventRole;
  }

  async getSpaceEvents(
    spaceId: string,
    page = 1,
    limit = 20,
    status?: EventStatus,
    deleted: DeletedFilter = 'active',
    viewerId?: string,
    includePast = false,
  ) {
    const skip = (page - 1) * limit;

    // This route is public. Outsiders (anonymous, or signed in without an
    // operator role here) only ever get the public list, whatever they ask
    // for: live events, plus finished ones when `includePast` (opt-in so
    // clients that treat every row as upcoming keep working).
    let visibilityWhere: Prisma.EventWhereInput = {};
    let statusIn: EventStatus[] | undefined;
    if (!(await this.isSpaceInsider(viewerId, spaceId))) {
      await assertCanViewSpace(this.prisma, spaceId, viewerId);
      status = undefined;
      statusIn = includePast ? LISTED_EVENT_STATUSES : LIVE_EVENT_STATUSES;
      deleted = 'active';
      visibilityWhere = listableEventsWhere(
        await memberSpaceIds(this.prisma, viewerId),
      );
    }

    // The space's own events plus any it co-hosts. Recurring-series OCCURRENCES
    // are excluded (`seriesParentId: null`) so a weekly series collapses to its
    // single parent row here instead of flooding the list with every date; the
    // occurrences are managed from the parent's Occurrences page. The parent
    // template itself (seriesParentId null, isRecurring true) stays, badged.
    const where: Prisma.EventWhereInput = {
      ...deletedWhere(deleted),
      seriesParentId: null,
      OR: [{ spaceId }, { coHosts: { some: { spaceId } } }],
      AND: [visibilityWhere],
    };
    if (status) {
      where.status = status;
    } else if (statusIn) {
      where.status = { in: statusIn };
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          space: { select: { id: true, name: true, slug: true } },
          // All visible+active ticket prices so cards derive Free / Paid /
          // "Starting from" from real prices, not the stale `isFree` flag
          // (which defaults to true and isn't recomputed when tickets change).
          ticketTypes: {
            where: { isVisible: true, isActive: true },
            select: { price: true, currency: true },
            orderBy: { price: 'asc' },
          },
          // Sub-event ticket prices so a big event with no tickets of its own
          // inherits its children's pricing (see inheritPricingFromChildren).
          childEvents: this.childPricingSelect,
          // Parent breadcrumb + a sub-event count so the dashboard can badge a
          // "big event" and group its sub-events under it.
          parentEvent: { select: { id: true, title: true, slug: true } },
          _count: {
            select: { registrations: true, childEvents: true },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    const breakdowns = await this.attendeeBreakdowns(events.map((e) => e.id));

    // Flag co-hosted events (owned by a different space) so the UI can badge them.
    // inheritPricingFromChildren also strips the childEvents helper payload.
    const data = events.map((e) => ({
      ...this.inheritPricingFromChildren(e),
      isCoHost: e.spaceId !== spaceId,
      attendees: breakdowns.get(e.id) ?? EMPTY_BREAKDOWN,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Headcounts for a page of events, split into individual and group bookings.
   *
   * Two aggregate queries for the whole page rather than one per card — the
   * list renders up to 100 events, and a per-event call would be a plain N+1.
   *
   * Counts *people*, not bookings: a group of twenty is twenty attendees and
   * one group. That distinction is the whole reason this exists — "registered"
   * on a card was read as a headcount when it was really a row count.
   */
  private async attendeeBreakdowns(
    eventIds: string[],
  ): Promise<Map<string, AttendeeBreakdown>> {
    const result = new Map<string, AttendeeBreakdown>();
    if (eventIds.length === 0) return result;

    const [groupRows, individualRows] = await Promise.all([
      this.prisma.eventRegistration.groupBy({
        by: ['eventId'],
        where: {
          ...COUNTS_AS_ATTENDING,
          ...IS_GROUP_BOOKING,
          eventId: { in: eventIds },
        },
        _sum: { groupSize: true },
        _count: { _all: true },
      }),
      this.prisma.eventRegistration.groupBy({
        by: ['eventId'],
        where: {
          ...COUNTS_AS_ATTENDING,
          ...IS_INDIVIDUAL_BOOKING,
          eventId: { in: eventIds },
        },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
    ]);

    const ensure = (id: string) => {
      const existing = result.get(id);
      if (existing) return existing;
      const fresh = { ...EMPTY_BREAKDOWN };
      result.set(id, fresh);
      return fresh;
    };

    for (const row of groupRows) {
      const b = ensure(row.eventId);
      b.groupAttendees = row._sum.groupSize ?? 0;
      b.groups = row._count._all;
    }
    for (const row of individualRows) {
      const b = ensure(row.eventId);
      b.individual = row._sum.quantity ?? 0;
    }
    for (const b of result.values()) {
      b.total = b.individual + b.groupAttendees;
    }

    return result;
  }

  async createTicketType(
    userId: string,
    eventId: string,
    dto: CreateTicketTypeDto,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        space: { include: { subscription: true } },
        ticketTypes: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const subscription = event.space.subscription!;
    const limits = this.planConfig.getEffectiveLimits(subscription);

    if (
      limits.ticketTypes !== null &&
      event.ticketTypes.length >= limits.ticketTypes
    ) {
      throw new BadRequestException(
        `Ticket type limit reached for ${subscription.plan} plan`,
      );
    }

    const kind = dto.kind ?? 'INDIVIDUAL';
    this.validateTicketConfig(kind, dto);
    // RSVP tickets are always free and one-click.
    const price = kind === 'RSVP' ? 0 : dto.price;

    this.validateWaitlistConfig(dto.waitlistEnabled, dto.totalQuantity ?? null);

    // Append after existing tiers unless the caller picked a slot, so a new
    // ticket never jumps above ones the organiser already ordered.
    const last = await this.prisma.eventTicketType.aggregate({
      where: { eventId },
      _max: { order: true },
    });
    const nextOrder = dto.order ?? (last._max.order ?? -1) + 1;

    const ticketType = await this.prisma.eventTicketType.create({
      data: {
        eventId,
        name: dto.name,
        description: dto.description,
        price: new Prisma.Decimal(price),
        kind,
        groupPricingMode: kind === 'GROUP' ? dto.groupPricingMode : null,
        minGroupSize: kind === 'GROUP' ? dto.minGroupSize : null,
        maxGroupSize: kind === 'GROUP' ? dto.maxGroupSize : null,
        totalQuantity: dto.totalQuantity ?? null,
        saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null,
        saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null,
        perUserLimit: dto.perUserLimit || 1,
        order: nextOrder,
        isVisible: dto.isVisible,
        isActive: dto.isActive,
        waitlistEnabled: dto.waitlistEnabled ?? false,
        waitlistOfferTtlHours: dto.waitlistOfferTtlHours ?? 24,
        whatsappGroupUrl: this.resolveTicketWhatsAppGroup(dto.whatsappGroupUrl),
      },
    });
    if (dto.blocksTicketTypeIds) {
      await this.syncTicketBlocks(eventId, ticketType.id, dto.blocksTicketTypeIds);
    }
    await this.cache.invalidateEventCache(event.slug);
    return ticketType;
  }

  /**
   * Replace the set of ticket types that `blockerId` blocks. A user holding the
   * blocker cannot register for any ticket in `blockedIds`. Ids must belong to
   * the same event, and a ticket cannot block itself.
   */
  private async syncTicketBlocks(
    eventId: string,
    blockerId: string,
    blockedIds: string[],
  ) {
    const uniqueBlockedIds = [...new Set(blockedIds)].filter(
      (id) => id !== blockerId,
    );

    if (uniqueBlockedIds.length > 0) {
      const validCount = await this.prisma.eventTicketType.count({
        where: { eventId, id: { in: uniqueBlockedIds } },
      });
      if (validCount !== uniqueBlockedIds.length) {
        throw new BadRequestException(
          'Blocked ticket types must belong to this event',
        );
      }
    }

    // Replace the blocker's outgoing edges atomically.
    await this.prisma.$transaction([
      this.prisma.ticketTypeBlock.deleteMany({ where: { blockerId } }),
      ...(uniqueBlockedIds.length > 0
        ? [
            this.prisma.ticketTypeBlock.createMany({
              data: uniqueBlockedIds.map((blockedId) => ({
                blockerId,
                blockedId,
              })),
            }),
          ]
        : []),
    ]);
  }

  /**
   * A waiting list only means something behind a capacity. Without
   * `totalQuantity` the ticket never sells out, so nothing could ever join the
   * queue — silently accepting the flag would leave the organiser believing
   * they had switched something on.
   */
  private validateWaitlistConfig(
    waitlistEnabled: boolean | undefined,
    totalQuantity: number | null,
  ) {
    if (waitlistEnabled && totalQuantity == null) {
      throw new BadRequestException(
        'Set a capacity before turning on the waiting list. A ticket with unlimited capacity never sells out, so no one would ever join the queue.',
      );
    }
  }

  /**
   * Validate group/RSVP consistency for a ticket type.
   * GROUP requires a pricing mode and a valid min ≤ max group size.
   */
  private validateTicketConfig(
    kind: string,
    dto: { groupPricingMode?: string; minGroupSize?: number; maxGroupSize?: number },
  ) {
    if (kind !== 'GROUP') return;
    if (!dto.groupPricingMode) {
      throw new BadRequestException('Group tickets require a pricing mode');
    }
    if (dto.minGroupSize == null || dto.maxGroupSize == null) {
      throw new BadRequestException(
        'Group tickets require min and max group size',
      );
    }
    if (dto.minGroupSize < 1 || dto.maxGroupSize < dto.minGroupSize) {
      throw new BadRequestException(
        'Group size must be at least 1 and max must be ≥ min',
      );
    }
  }

  async updateTicketType(
    userId: string,
    eventId: string,
    typeId: string,
    dto: UpdateTicketTypeDto,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const existing = await this.prisma.eventTicketType.findUnique({
      where: { id: typeId },
    });
    if (!existing || existing.eventId !== eventId) {
      throw new NotFoundException('Ticket type not found');
    }

    // Resolve the effective kind/group config (new value falls back to stored).
    const kind = dto.kind ?? existing.kind;
    const groupPricingMode =
      dto.groupPricingMode ?? existing.groupPricingMode ?? undefined;
    const minGroupSize = dto.minGroupSize ?? existing.minGroupSize ?? undefined;
    const maxGroupSize = dto.maxGroupSize ?? existing.maxGroupSize ?? undefined;
    this.validateTicketConfig(kind, {
      groupPricingMode,
      minGroupSize,
      maxGroupSize,
    });

    // Check the combination that will exist after this update, not just the
    // fields being sent: clearing the capacity on a ticket that already has a
    // waiting list is just as broken as enabling one without a capacity.
    const waitlistEnabled = dto.waitlistEnabled ?? existing.waitlistEnabled;
    const totalQuantity =
      dto.totalQuantity !== undefined ? dto.totalQuantity : existing.totalQuantity;
    this.validateWaitlistConfig(waitlistEnabled, totalQuantity ?? null);

    const updated = await this.prisma.eventTicketType.update({
      where: { id: typeId },
      data: {
        name: dto.name,
        description: dto.description,
        price:
          dto.price !== undefined
            ? new Prisma.Decimal(kind === 'RSVP' ? 0 : dto.price)
            : undefined,
        kind: dto.kind,
        // When switching away from GROUP, clear the group fields.
        groupPricingMode: kind === 'GROUP' ? groupPricingMode : null,
        minGroupSize: kind === 'GROUP' ? minGroupSize : null,
        maxGroupSize: kind === 'GROUP' ? maxGroupSize : null,
        totalQuantity: dto.totalQuantity !== undefined ? dto.totalQuantity : undefined,
        perUserLimit: dto.perUserLimit,
        order: dto.order,
        // undefined = leave as-is; null/empty = clear the bound; value = set it.
        saleStartsAt:
          dto.saleStartsAt === undefined
            ? undefined
            : dto.saleStartsAt
              ? new Date(dto.saleStartsAt)
              : null,
        saleEndsAt:
          dto.saleEndsAt === undefined
            ? undefined
            : dto.saleEndsAt
              ? new Date(dto.saleEndsAt)
              : null,
        isVisible: dto.isVisible,
        isActive: dto.isActive,
        waitlistEnabled: dto.waitlistEnabled,
        waitlistOfferTtlHours: dto.waitlistOfferTtlHours,
        // undefined = leave as-is; "" clears; a value is validated + normalised.
        whatsappGroupUrl:
          dto.whatsappGroupUrl === undefined
            ? undefined
            : this.resolveTicketWhatsAppGroup(dto.whatsappGroupUrl),
      },
    });
    if (dto.blocksTicketTypeIds !== undefined) {
      await this.syncTicketBlocks(eventId, typeId, dto.blocksTicketTypeIds);
    }
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deleteTicketType(userId: string, eventId: string, typeId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    // Refuse to delete a ticket type that has real (paid, non-cancelled)
    // registrations — deleting it would orphan those attendees. Abandoned
    // (unpaid/cancelled) rows are fine: the FK detaches them (SET NULL).
    const activeRegistrations = await this.prisma.eventRegistration.count({
      where: {
        ticketTypeId: typeId,
        paymentStatus: PaymentStatus.PAID,
        status: { not: RegistrationStatus.CANCELLED },
      },
    });
    if (activeRegistrations > 0) {
      throw new BadRequestException(
        'This ticket type has active registrations and cannot be deleted. ' +
          'Cancel or refund them first, or hide the ticket instead.',
      );
    }

    const deleted = await this.prisma.eventTicketType.delete({
      where: { id: typeId },
    });
    await this.cache.invalidateEventCache(event.slug);
    return deleted;
  }

  /**
   * Operator view of an event's ticket types: every tier including hidden and
   * paused ones (the public event payload filters those out, so an operator
   * reading it could never switch a hidden ticket back on), plus per-tier
   * stats. `revenue` is null for callers without the event's money capability.
   */
  async getManageTicketTypes(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.canManageEvent(userId, event.spaceId, event.id))) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const [types, canSeeMoney, attending, checkedIn, waitlist, paid] =
      await Promise.all([
        this.prisma.eventTicketType.findMany({
          where: { eventId },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            blockedBy: { select: { blockerId: true } },
            blocks: { select: { blockedId: true } },
          },
        }),
        this.authz.can({ id: userId }, Action.EVENT_MANAGE_MONEY, { eventId }),
        this.prisma.eventRegistration.groupBy({
          by: ['ticketTypeId'],
          where: { eventId, ...COUNTS_AS_ATTENDING },
          _count: { _all: true },
        }),
        this.prisma.eventRegistration.groupBy({
          by: ['ticketTypeId'],
          where: { eventId, ...COUNTS_AS_ATTENDING, checkedInAt: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.eventRegistration.groupBy({
          by: ['ticketTypeId', 'waitlistStatus'],
          where: {
            eventId,
            isWaitlisted: true,
            status: { not: RegistrationStatus.CANCELLED },
            waitlistStatus: { in: ['WAITING', 'OFFERED'] },
          },
          _count: { _all: true },
        }),
        // Same "current gross" definition as the financials page: PAID rows,
        // ticket amount net of the platform processing fee.
        this.prisma.eventRegistration.groupBy({
          by: ['ticketTypeId'],
          where: { eventId, paymentStatus: PaymentStatus.PAID },
          _sum: { totalAmount: true, processingFee: true },
        }),
      ]);

    const countBy = (rows: { ticketTypeId: string | null; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.ticketTypeId, r._count._all]));
    const attendingBy = countBy(attending);
    const checkedInBy = countBy(checkedIn);

    return types.map((t) => {
      const wl = waitlist.filter((w) => w.ticketTypeId === t.id);
      const rev = paid.find((p) => p.ticketTypeId === t.id);
      return {
        ...t,
        stats: {
          registrations: attendingBy.get(t.id) ?? 0,
          checkedIn: checkedInBy.get(t.id) ?? 0,
          waitlistWaiting:
            wl.find((w) => w.waitlistStatus === 'WAITING')?._count._all ?? 0,
          waitlistOffered:
            wl.find((w) => w.waitlistStatus === 'OFFERED')?._count._all ?? 0,
          revenue: canSeeMoney
            ? Number(rev?._sum.totalAmount ?? 0) -
              Number(rev?._sum.processingFee ?? 0)
            : null,
        },
      };
    });
  }

  /**
   * Persist a new display order. `ids` must be exactly this event's ticket
   * types; position in the array becomes `order`.
   */
  async reorderTicketTypes(userId: string, eventId: string, ids: string[]) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true, slug: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.canManageEvent(userId, event.spaceId, event.id))) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const existing = await this.prisma.eventTicketType.findMany({
      where: { eventId },
      select: { id: true },
    });
    const known = new Set(existing.map((t) => t.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw new BadRequestException(
        'Send every ticket type of this event exactly once.',
      );
    }

    await this.prisma.$transaction(
      ids.map((id, order) =>
        this.prisma.eventTicketType.update({ where: { id }, data: { order } }),
      ),
    );
    await this.cache.invalidateEventCache(event.slug);
    return { ok: true };
  }

  async createAgenda(userId: string, eventId: string, dto: CreateAgendaDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    return this.prisma.eventAgenda.create({
      data: {
        eventId,
        title: dto.title,
        description: dto.description,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        speakerName: dto.speakerName,
        order: dto.order || 0,
      },
    });
  }

  async createSpeaker(userId: string, eventId: string, dto: CreateSpeakerDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    return this.prisma.eventSpeaker.create({
      data: {
        eventId,
        name: dto.name,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        designation: dto.designation,
        company: dto.company,
        linkedinUrl: dto.linkedinUrl,
        order: dto.order || 0,
      },
    });
  }

  async createFormField(
    userId: string,
    eventId: string,
    dto: CreateFormFieldDto,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    // When scoped to a ticket type, make sure it belongs to this event.
    if (dto.ticketTypeId) {
      const ticketType = await this.prisma.eventTicketType.findUnique({
        where: { id: dto.ticketTypeId },
        select: { eventId: true },
      });
      if (!ticketType || ticketType.eventId !== eventId) {
        throw new NotFoundException('Ticket type not found');
      }
    }

    const options = (dto.options || []).map((o) => o.trim()).filter(Boolean);
    const config = sanitizeConfig(dto.type, dto.config);
    const showIf = showIfOf({ showIf: dto.showIf });
    await this.assertValidFormField(eventId, dto.ticketTypeId ?? null, {
      type: dto.type,
      options,
      perGroup: dto.perGroup || false,
      order: dto.order || 0,
      config,
      showIf: dto.showIf ?? null,
    });

    const field = await this.prisma.eventFormField.create({
      data: {
        eventId,
        ticketTypeId: dto.ticketTypeId ?? null,
        label: dto.label,
        type: dto.type,
        options,
        // A section heading is never answered.
        isRequired: dto.type === 'SECTION' ? false : dto.isRequired || false,
        perGroup: dto.perGroup || false,
        order: dto.order || 0,
        helpText: dto.helpText?.trim() || null,
        config: (config as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
        showIf: showIf
          ? { fieldId: showIf.fieldId, anyOf: showIf.anyOf }
          : Prisma.DbNull,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return field;
  }

  /**
   * Reject a question definition that breaks the form rules (options, limits,
   * show-if). Siblings are the other questions on the same ticket form.
   */
  private async assertValidFormField(
    eventId: string,
    ticketTypeId: string | null,
    def: Parameters<typeof checkFieldDefinition>[0],
  ) {
    const siblings = await this.prisma.eventFormField.findMany({
      where: {
        eventId,
        ticketTypeId,
        ...(def.id ? { id: { not: def.id } } : {}),
      },
    });
    const error = checkFieldDefinition(def, siblings);
    if (error) throw new BadRequestException(error);
  }

  async updateFormField(
    userId: string,
    eventId: string,
    fieldId: string,
    dto: UpdateFormFieldDto,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const field = await this.prisma.eventFormField.findUnique({
      where: { id: fieldId },
    });
    if (!field || field.eventId !== eventId) {
      throw new NotFoundException('Form field not found');
    }

    // Old answers would stop matching a new type, so the type is fixed once
    // anyone has registered on this ticket (or event, for an event-wide form).
    if (dto.type && dto.type !== field.type) {
      const answered = await this.prisma.eventRegistration.count({
        where: {
          eventId,
          ...(field.ticketTypeId ? { ticketTypeId: field.ticketTypeId } : {}),
        },
      });
      if (answered > 0) {
        throw new BadRequestException(
          "People have already registered, so this question's type can't change. Add a new question instead.",
        );
      }
    }

    const type = dto.type ?? field.type;
    const options =
      dto.options !== undefined
        ? dto.options.map((o) => o.trim()).filter(Boolean)
        : field.options;
    const config = sanitizeConfig(
      type,
      dto.config !== undefined ? dto.config : field.config,
    );
    const rawShowIf = dto.showIf !== undefined ? dto.showIf : field.showIf;
    const showIf = showIfOf({ showIf: rawShowIf });
    await this.assertValidFormField(eventId, field.ticketTypeId, {
      id: field.id,
      type,
      options,
      perGroup: dto.perGroup ?? field.perGroup,
      order: dto.order ?? field.order,
      config,
      showIf: rawShowIf ?? null,
    });

    const updated = await this.prisma.eventFormField.update({
      where: { id: fieldId },
      data: {
        label: dto.label,
        type: dto.type,
        options,
        isRequired: type === 'SECTION' ? false : dto.isRequired,
        perGroup: dto.perGroup,
        order: dto.order,
        helpText:
          dto.helpText === undefined ? undefined : dto.helpText?.trim() || null,
        config: (config as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
        showIf: showIf
          ? { fieldId: showIf.fieldId, anyOf: showIf.anyOf }
          : Prisma.DbNull,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deleteFormField(userId: string, eventId: string, fieldId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const canManage = await this.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot manage this event');
    }

    const field = await this.prisma.eventFormField.findUnique({
      where: { id: fieldId },
    });
    if (!field || field.eventId !== eventId) {
      throw new NotFoundException('Form field not found');
    }

    // Questions shown only "if this one is X" would otherwise hang on a
    // condition that can never be met; they become always shown.
    const [deleted] = await this.prisma.$transaction([
      this.prisma.eventFormField.delete({ where: { id: fieldId } }),
      this.prisma.eventFormField.updateMany({
        where: { eventId, showIf: { path: ['fieldId'], equals: fieldId } },
        data: { showIf: Prisma.DbNull },
      }),
    ]);
    await this.cache.invalidateEventCache(event.slug);
    return deleted;
  }

  // ---------------------------------------------------------------------------
  // Structured content sections (agenda / speakers / prizes / contacts / faqs).
  // All share the same manage-permission check and invalidate the cached event
  // so the public page reflects edits immediately.
  // ---------------------------------------------------------------------------

  async updateAgenda(
    userId: string,
    eventId: string,
    agendaId: string,
    dto: UpdateAgendaDto,
  ) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventAgenda.findUnique({
      where: { id: agendaId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Agenda item not found');
    }
    const updated = await this.prisma.eventAgenda.update({
      where: { id: agendaId },
      data: {
        title: dto.title,
        description: dto.description,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        speakerName: dto.speakerName,
        order: dto.order,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deleteAgenda(userId: string, eventId: string, agendaId: string) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventAgenda.findUnique({
      where: { id: agendaId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Agenda item not found');
    }
    await this.prisma.eventAgenda.delete({ where: { id: agendaId } });
    await this.cache.invalidateEventCache(event.slug);
    return { success: true };
  }

  async updateSpeaker(
    userId: string,
    eventId: string,
    speakerId: string,
    dto: UpdateSpeakerDto,
  ) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventSpeaker.findUnique({
      where: { id: speakerId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Speaker not found');
    }
    const updated = await this.prisma.eventSpeaker.update({
      where: { id: speakerId },
      data: {
        name: dto.name,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        designation: dto.designation,
        company: dto.company,
        linkedinUrl: dto.linkedinUrl,
        order: dto.order,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deleteSpeaker(userId: string, eventId: string, speakerId: string) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventSpeaker.findUnique({
      where: { id: speakerId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Speaker not found');
    }
    await this.prisma.eventSpeaker.delete({ where: { id: speakerId } });
    await this.cache.invalidateEventCache(event.slug);
    return { success: true };
  }

  async createPrize(userId: string, eventId: string, dto: CreatePrizeDto) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const prize = await this.prisma.eventPrize.create({
      data: {
        eventId,
        title: dto.title,
        description: dto.description,
        rank: dto.rank,
        value: dto.value,
        order: dto.order || 0,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return prize;
  }

  async updatePrize(
    userId: string,
    eventId: string,
    prizeId: string,
    dto: UpdatePrizeDto,
  ) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventPrize.findUnique({
      where: { id: prizeId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Prize not found');
    }
    const updated = await this.prisma.eventPrize.update({
      where: { id: prizeId },
      data: {
        title: dto.title,
        description: dto.description,
        rank: dto.rank,
        value: dto.value,
        order: dto.order,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deletePrize(userId: string, eventId: string, prizeId: string) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventPrize.findUnique({
      where: { id: prizeId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Prize not found');
    }
    await this.prisma.eventPrize.delete({ where: { id: prizeId } });
    await this.cache.invalidateEventCache(event.slug);
    return { success: true };
  }

  async createContact(userId: string, eventId: string, dto: CreateContactDto) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const contact = await this.prisma.eventContact.create({
      data: {
        eventId,
        name: dto.name,
        role: dto.role,
        email: dto.email,
        phone: dto.phone,
        order: dto.order || 0,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return contact;
  }

  async updateContact(
    userId: string,
    eventId: string,
    contactId: string,
    dto: UpdateContactDto,
  ) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventContact.findUnique({
      where: { id: contactId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Contact not found');
    }
    const updated = await this.prisma.eventContact.update({
      where: { id: contactId },
      data: {
        name: dto.name,
        role: dto.role,
        email: dto.email,
        phone: dto.phone,
        order: dto.order,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deleteContact(userId: string, eventId: string, contactId: string) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventContact.findUnique({
      where: { id: contactId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('Contact not found');
    }
    await this.prisma.eventContact.delete({ where: { id: contactId } });
    await this.cache.invalidateEventCache(event.slug);
    return { success: true };
  }

  async createFaq(userId: string, eventId: string, dto: CreateFaqDto) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const faq = await this.prisma.eventFaq.create({
      data: {
        eventId,
        question: dto.question,
        answer: dto.answer,
        order: dto.order || 0,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return faq;
  }

  async updateFaq(
    userId: string,
    eventId: string,
    faqId: string,
    dto: UpdateFaqDto,
  ) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventFaq.findUnique({
      where: { id: faqId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('FAQ not found');
    }
    const updated = await this.prisma.eventFaq.update({
      where: { id: faqId },
      data: {
        question: dto.question,
        answer: dto.answer,
        order: dto.order,
      },
    });
    await this.cache.invalidateEventCache(event.slug);
    return updated;
  }

  async deleteFaq(userId: string, eventId: string, faqId: string) {
    const event = await this.assertCanManageEvent(userId, eventId);
    const item = await this.prisma.eventFaq.findUnique({
      where: { id: faqId },
    });
    if (!item || item.eventId !== eventId) {
      throw new NotFoundException('FAQ not found');
    }
    await this.prisma.eventFaq.delete({ where: { id: faqId } });
    await this.cache.invalidateEventCache(event.slug);
    return { success: true };
  }

  /**
   * Helper: Format event date for display
   * Output: "7 June 2026"
   */
  private formatEventDate(dateTime: Date, timezone = 'Asia/Kolkata'): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
    }).format(dateTime);
  }

  /**
   * Helper: Format event time range
   * Output: "10:00 AM - 1:00 PM IST"
   */
  private formatEventTime(
    startTime: Date,
    endTime: Date,
    timezone = 'Asia/Kolkata',
  ): string {
    const formatTime = (date: Date) =>
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).format(date);

    return `${formatTime(startTime)} - ${formatTime(endTime)} IST`;
  }
}
