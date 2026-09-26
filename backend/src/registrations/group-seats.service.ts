import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EventStatus,
  GroupSeatStatus,
  PaymentStatus,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';

export interface CreateSeatsParams {
  registrationId: string;
  /** The lead (payer) — auto-claims seat 1. */
  leadUserId: string;
  /** Total seats purchased (group size). */
  seatCount: number;
  /**
   * Legacy/upfront member details, if the client still collects them. When
   * present, those seats are created CLAIMED; any remaining seats up to
   * `seatCount` are OPEN for later invite/claim (fast-registration Part 2).
   */
  groupMembers?: unknown[] | null;
}

export interface SeatInvite {
  /** Target a specific OPEN seat; omit to fill the next available OPEN seat. */
  seatIndex?: number;
  email: string;
}

/** One member entry a lead types into the roster (mirrors GroupMemberDto). */
export interface RosterMember {
  name?: string;
  email?: string;
  mobile?: string | null;
  gender?: string | null;
  customFields?: Record<string, unknown>;
}

/** A registration that still gives its holders a place at the event. */
const ACTIVE_REGISTRATION = {
  status: { not: RegistrationStatus.CANCELLED },
  paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
} satisfies Prisma.EventRegistrationWhereInput;

/** "dhanush@wegobeyond.in" → "dh•••@wegobeyond.in": enough to recognise, not to harvest. */
function maskEmail(email: string): string {
  const [user, domain] = email.trim().split('@');
  if (!domain) return '•••';
  return `${user.slice(0, 2)}•••@${domain}`;
}

@Injectable()
export class GroupSeatsService {
  private readonly logger = new Logger(GroupSeatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** 32-byte invite token (64 hex chars); rotated on revoke. */
  static newToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private ticketCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  private qrCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private claimUrl(token: string): string {
    const base = (process.env.WEB_URL || 'https://unifesto.app').replace(/\/$/, '');
    return `${base}/claim/${token}`;
  }

  /**
   * Create the N seat rows for a group registration, inside the caller's
   * transaction. Seat 1 is CLAIMED to the lead; upfront members (if any) are
   * CLAIMED with their details; the rest are OPEN. Idempotent — skips if seats
   * already exist for the registration.
   */
  async createSeatsForRegistration(
    tx: Prisma.TransactionClient,
    params: CreateSeatsParams,
  ): Promise<void> {
    const { registrationId, leadUserId, seatCount } = params;
    if (seatCount <= 1) return; // not a group

    const existing = await tx.groupSeat.count({ where: { registrationId } });
    if (existing > 0) return;

    const members = Array.isArray(params.groupMembers) ? params.groupMembers : [];
    const now = new Date();

    const rows: Prisma.GroupSeatCreateManyInput[] = [];
    for (let i = 1; i <= seatCount; i++) {
      const memberDetail = members[i - 1];
      const hasDetail = memberDetail != null;
      const isLead = i === 1;
      const claimed = isLead || hasDetail;
      rows.push({
        registrationId,
        seatIndex: i,
        status: claimed ? GroupSeatStatus.CLAIMED : GroupSeatStatus.OPEN,
        inviteToken: GroupSeatsService.newToken(),
        memberDetails: hasDetail
          ? (memberDetail as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        claimedByUserId: isLead ? leadUserId : null,
        claimedAt: claimed ? now : null,
      });
    }

    await tx.groupSeat.createMany({ data: rows });
  }

  /**
   * Materialise seats for a group registration that has none yet — a group
   * booked before seat-seeding shipped (its members still live only in the
   * legacy `groupMembers` JSON). Seat-based flows (the WhatsApp member blast,
   * roster edits) silently skip a seatless group's members, so callers that
   * fan out per member seat should run this first. Self-transacting and
   * idempotent: a no-op when seats already exist or it isn't a group.
   */
  async ensureSeatsForRegistration(registrationId: string): Promise<void> {
    const existing = await this.prisma.groupSeat.count({
      where: { registrationId },
    });
    if (existing > 0) return;

    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { id: true, userId: true, groupSize: true, groupMembers: true },
    });
    if (!reg || !reg.groupSize || reg.groupSize <= 1) return;

    await this.prisma.$transaction((tx) =>
      this.createSeatsForRegistration(tx, {
        registrationId: reg.id,
        leadUserId: reg.userId,
        seatCount: reg.groupSize as number,
        groupMembers: Array.isArray(reg.groupMembers) ? reg.groupMembers : null,
      }),
    );
  }

  /**
   * Apply a lead-typed roster onto the group's seats — the seat-model
   * replacement for the old `EventRegistration.groupMembers` rewrite. Members
   * are positional: member `i` (0-based) fills seat `i + 1`.
   *
   * Merge policy (confirmed with product): a lead-filled entry lands on its seat
   * as CLAIMED with `claimedByUserId` left NULL — the same shape the legacy JSON
   * backfill produced, so attendee counts and check-in eligibility are unchanged
   * (a filled seat is an attendee). Seats the lead must NOT overwrite are skipped:
   *   • a seat CLAIMED by a real account (a member who claimed their own seat owns
   *     their details), and
   *   • a seat currently INVITED (an invite is in flight; typing details must not
   *     silently claim it out from under the invitee).
   * Seat 1 is the lead's own and is always updatable (they keep their claim).
   *
   * Returns the member entries whose seat went OPEN → CLAIMED, i.e. members newly
   * added to the roster — the caller emails each the shared ticket, preserving
   * today's "new member gets their ticket" behaviour.
   *
   * Ensures seats exist first, so a group booked before seats were seeded (or one
   * missed by a backfill) is materialised on its first roster edit rather than
   * throwing. Owner assertion is the caller's job.
   */
  async applyLeadRoster(
    registrationId: string,
    leadUserId: string,
    groupSize: number,
    // `null` = leave that seat as it is (the lead edited someone else).
    members: (RosterMember | null)[],
  ): Promise<{ filledMembers: RosterMember[] }> {
    return this.prisma.$transaction(async (tx) => {
      // Materialise seats for a group that has none yet (legacy / un-backfilled).
      const existing = await tx.groupSeat.count({ where: { registrationId } });
      if (existing === 0) {
        await this.createSeatsForRegistration(tx, {
          registrationId,
          leadUserId,
          seatCount: groupSize,
          groupMembers: null, // seed empty; the merge below fills them
        });
      }

      const seats = await tx.groupSeat.findMany({
        where: { registrationId },
        orderBy: { seatIndex: 'asc' },
        select: {
          id: true,
          seatIndex: true,
          status: true,
          claimedByUserId: true,
          claimedAt: true,
          memberDetails: true,
        },
      });
      const seatByIndex = new Map(seats.map((s) => [s.seatIndex, s]));

      const filledMembers: RosterMember[] = [];
      const now = new Date();

      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        if (!member) continue;
        const seat = seatByIndex.get(i + 1);
        if (!seat) continue; // more members than seats — capped upstream, ignore
        const isLead = seat.seatIndex === 1;

        // Don't disturb a retired seat, an in-flight invite, or a seat a real
        // member already owns.
        if (seat.status === GroupSeatStatus.RELEASED) continue;
        if (seat.status === GroupSeatStatus.INVITED) continue;
        if (
          !isLead &&
          seat.status === GroupSeatStatus.CLAIMED &&
          seat.claimedByUserId != null
        ) {
          continue;
        }

        const wasOpen = seat.status === GroupSeatStatus.OPEN;
        // Identity is write-once: a member's name, email, mobile and gender
        // can't be changed after they're set, only blanks filled. Custom-field
        // answers stay editable.
        const prev =
          seat.memberDetails && typeof seat.memberDetails === 'object' && !Array.isArray(seat.memberDetails)
            ? (seat.memberDetails as Record<string, unknown>)
            : {};
        const locked = (k: string) => (typeof prev[k] === 'string' && (prev[k] as string).trim() ? { [k]: prev[k] } : {});
        const merged = {
          ...prev,
          ...member,
          ...locked('name'),
          ...locked('email'),
          ...locked('mobile'),
          ...locked('gender'),
        };
        await tx.groupSeat.update({
          where: { id: seat.id },
          data: {
            memberDetails: merged as Prisma.InputJsonValue,
            status: GroupSeatStatus.CLAIMED,
            claimedAt: seat.claimedAt ?? now,
            // claimedByUserId is left as-is: the lead keeps their id on seat 1;
            // a lead-filled member seat stays NULL (backfill semantics).
          },
        });
        if (wasOpen) filledMembers.push(member);
      }

      return { filledMembers };
    });
  }

  /**
   * The group's roster projected out of its seats, in the flat
   * `{ name, email, mobile, gender }` shape the lead's "complete roster" screen
   * expects — one entry per seat, ordered by seat index. Blank fields are normal
   * for OPEN / not-yet-filled seats. Returns null when the group has no seats
   * (caller falls back to the legacy JSON during the transition).
   */
  async getRoster(registrationId: string): Promise<
    | {
        name: string;
        email: string;
        mobile: string;
        gender: string;
        customFields: Record<string, unknown>;
      }[]
    | null
  > {
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId },
      orderBy: { seatIndex: 'asc' },
      select: { memberDetails: true, status: true, inviteEmail: true },
    });
    if (seats.length === 0) return null;
    return seats.map((s) => {
      const m = (s.memberDetails ?? {}) as Record<string, unknown>;
      const isObj = m && typeof m === 'object' && !Array.isArray(m);
      const str = (v: unknown) => (isObj && typeof v === 'string' ? v : '');
      // Custom-field answers are stored alongside the base fields in the same
      // memberDetails blob; carry them through so the lead's manage screen can
      // display and re-edit them rather than silently dropping them.
      const custom =
        isObj && m.customFields && typeof m.customFields === 'object' && !Array.isArray(m.customFields)
          ? (m.customFields as Record<string, unknown>)
          : {};
      return {
        name: str(m.name),
        // Seats claimed before claims recorded an email: use the invite email.
        email: str(m.email) || (s.status === GroupSeatStatus.CLAIMED ? s.inviteEmail ?? '' : ''),
        mobile: str(m.mobile),
        gender: str(m.gender),
        customFields: custom,
      };
    });
  }

  /** Seats for a group registration (lead-only), for the invite/manage screen. */
  async listSeats(registrationId: string, leadUserId: string) {
    await this.assertLead(registrationId, leadUserId);
    // Groups booked before seat-seeding have no seats (members only in the
    // legacy JSON). Materialise them so the lead always manages seats and can
    // invite by email; otherwise the app falls back to typing members in.
    await this.ensureSeatsForRegistration(registrationId);
    // Released seats are returned too (de-emphasised in the UI) so the lead can
    // reopen one they retired by mistake; the invite flow ignores them since it
    // only targets OPEN seats.
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId },
      orderBy: { seatIndex: 'asc' },
      select: {
        seatIndex: true,
        status: true,
        inviteEmail: true,
        memberDetails: true,
        claimedByUserId: true,
        claimedAt: true,
      },
    });
    // Seats claimed before claims recorded an email show the invite email.
    return {
      seats: seats.map((seat) => {
        const md = seat.memberDetails;
        if (seat.status !== GroupSeatStatus.CLAIMED || !seat.inviteEmail || !md || typeof md !== 'object' || Array.isArray(md)) {
          return seat;
        }
        const obj = md as Record<string, unknown>;
        return typeof obj.email === 'string' && obj.email.trim()
          ? seat
          : { ...seat, memberDetails: { ...obj, email: seat.inviteEmail } };
      }),
    };
  }

  // ── Lead-managed: invite / revoke ───────────────────────────────────────────

  private async assertLead(registrationId: string, userId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { id: true, userId: true, event: { select: { id: true, title: true, slug: true } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.userId !== userId) {
      throw new ForbiddenException('Only the group lead can manage these seats');
    }
    return reg;
  }

  /**
   * Assign invite emails to OPEN seats → INVITED, and email the claim link.
   * Rate-limited implicitly to the number of OPEN seats (can't over-invite a
   * group). Each assignment keeps the seat's existing token as the capability.
   */
  async invite(registrationId: string, leadUserId: string, invites: SeatInvite[]) {
    const reg = await this.assertLead(registrationId, leadUserId);
    if (invites.length === 0) throw new BadRequestException('No invites provided');
    await this.ensureSeatsForRegistration(registrationId);

    const open = await this.prisma.groupSeat.findMany({
      where: { registrationId, status: GroupSeatStatus.OPEN },
      orderBy: { seatIndex: 'asc' },
    });
    const openByIndex = new Map(open.map((s) => [s.seatIndex, s]));
    let nextPool = [...open];

    const results: { seatIndex: number; email: string }[] = [];
    for (const inv of invites) {
      const email = inv.email.trim().toLowerCase();
      const seat =
        inv.seatIndex != null
          ? openByIndex.get(inv.seatIndex)
          : nextPool.shift();
      if (!seat) {
        throw new BadRequestException('No open seats left to invite to');
      }
      // Consume the chosen seat from both structures.
      openByIndex.delete(seat.seatIndex);
      nextPool = nextPool.filter((s) => s.seatIndex !== seat.seatIndex);

      await this.prisma.groupSeat.update({
        where: { id: seat.id },
        data: { status: GroupSeatStatus.INVITED, inviteEmail: email },
      });
      results.push({ seatIndex: seat.seatIndex, email });

      // Best-effort invite email.
      this.email
        .sendRawEmail(
          email,
          `You're invited to ${reg.event.title}`,
          this.inviteHtml(reg.event.title, this.claimUrl(seat.inviteToken)),
        )
        .catch((err) => this.logger.error(`Invite email failed to ${email}`, err));
    }

    return { invited: results };
  }

  /**
   * Retire an unfilled seat the lead/curator no longer wants to fill:
   * `OPEN | INVITED → RELEASED`. Like {@link revoke}, an outstanding invite is
   * dropped — the token is rotated and the email cleared so any live claim link
   * dies. Atomic guarded `updateMany` (only `OPEN`/`INVITED` match, `count === 1`)
   * so it can never touch a CLAIMED seat and is race-safe. Capacity stays held;
   * no resale, no refund. Authorisation is the caller's job (the lead controller
   * asserts ownership; the curator path relies on its `@Can` guard).
   */
  async releaseSeat(registrationId: string, seatIndex: number) {
    const res = await this.prisma.groupSeat.updateMany({
      where: {
        registrationId,
        seatIndex,
        status: { in: [GroupSeatStatus.OPEN, GroupSeatStatus.INVITED] },
      },
      data: {
        status: GroupSeatStatus.RELEASED,
        inviteEmail: null,
        inviteToken: GroupSeatsService.newToken(),
        reminderSentAt: null,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        'That seat cannot be released (only an unfilled or invited seat can be retired)',
      );
    }
    return { seatIndex, status: GroupSeatStatus.RELEASED };
  }

  /**
   * Bring a retired seat back into play: `RELEASED → OPEN` with a fresh token,
   * so the lead can invite into it again. Race-safe guarded `updateMany`.
   */
  async reopenSeat(registrationId: string, seatIndex: number) {
    const res = await this.prisma.groupSeat.updateMany({
      where: { registrationId, seatIndex, status: GroupSeatStatus.RELEASED },
      data: {
        status: GroupSeatStatus.OPEN,
        inviteToken: GroupSeatsService.newToken(),
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException('That seat is not currently released');
    }
    return { seatIndex, status: GroupSeatStatus.OPEN };
  }

  /** Lead retires one of their own unfilled seats (asserts ownership first). */
  async releaseAsLead(
    registrationId: string,
    leadUserId: string,
    seatIndex: number,
  ) {
    await this.assertLead(registrationId, leadUserId);
    return this.releaseSeat(registrationId, seatIndex);
  }

  /** Lead brings one of their own retired seats back into play. */
  async reopenAsLead(
    registrationId: string,
    leadUserId: string,
    seatIndex: number,
  ) {
    await this.assertLead(registrationId, leadUserId);
    return this.reopenSeat(registrationId, seatIndex);
  }

  /** Revoke an INVITED seat back to OPEN and rotate its token (old link dies). */
  async revoke(registrationId: string, leadUserId: string, seatIndex: number) {
    await this.assertLead(registrationId, leadUserId);
    const res = await this.prisma.groupSeat.updateMany({
      where: { registrationId, seatIndex, status: GroupSeatStatus.INVITED },
      data: {
        status: GroupSeatStatus.OPEN,
        inviteEmail: null,
        inviteToken: GroupSeatsService.newToken(),
        reminderSentAt: null,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        'That seat is not currently invited (a claimed seat can only change hands via ticket transfer)',
      );
    }
    return { seatIndex, status: GroupSeatStatus.OPEN };
  }

  // ── Member-facing: claim / decline ──────────────────────────────────────────

  private async seatByTokenOrThrow(token: string) {
    const seat = await this.prisma.groupSeat.findUnique({
      where: { inviteToken: token },
      include: {
        registration: {
          select: {
            id: true,
            eventId: true,
            // The claimer answers this ticket's per-member custom questions.
            ticketTypeId: true,
            // Whether the group + event can still take a claim.
            status: true,
            paymentStatus: true,
            event: {
              select: { id: true, title: true, slug: true, status: true, endDateTime: true, deletedAt: true },
            },
          },
        },
      },
    });
    if (!seat) throw new NotFoundException('This claim link is invalid or has expired');
    return seat;
  }

  /**
   * The signed-in account must own the invited email (any of its linked
   * emails, case-insensitive). The link alone is never enough: a forwarded or
   * leaked invite can't be claimed by someone else, and the seat always lands
   * on the person it was sent to.
   */
  private async assertHybridAuth(inviteEmail: string | null, claimerUserId: string) {
    if (!inviteEmail) {
      throw new ForbiddenException("This seat hasn't been sent to anyone yet, so it can't be claimed.");
    }
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId: claimerUserId, email: { equals: inviteEmail.trim(), mode: 'insensitive' } },
      select: { userId: true },
    });
    if (!identity) {
      throw new ForbiddenException(
        `This invite is for a different account (${maskEmail(inviteEmail)}). Sign in with that email to claim it.`,
      );
    }
  }

  /**
   * A claim needs a live group and a live event — the same rules the Home
   * "you've been invited" list uses, so the two never disagree.
   */
  private assertSeatClaimable(seat: Awaited<ReturnType<GroupSeatsService['seatByTokenOrThrow']>>) {
    const reg = seat.registration;
    const ev = reg.event;
    if (
      reg.status === RegistrationStatus.CANCELLED ||
      !([PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] as PaymentStatus[]).includes(reg.paymentStatus)
    ) {
      throw new BadRequestException('This group booking was cancelled, so its seats can no longer be claimed');
    }
    if (ev.deletedAt || ev.status === EventStatus.CANCELLED) {
      throw new BadRequestException('This event was cancelled');
    }
    if (ev.status === EventStatus.COMPLETED || ev.endDateTime < new Date()) {
      throw new BadRequestException('This event has already ended');
    }
    if (ev.status === EventStatus.DRAFT) {
      throw new BadRequestException("This event isn't open yet");
    }
  }

  /** Reject if the claimer is already in this event (any ticket, individual or group). */
  private async assertNotAlreadyInEvent(eventId: string, claimerUserId: string, exceptSeatId: string) {
    if (await this.isAlreadyInEvent(eventId, claimerUserId, exceptSeatId)) {
      throw new BadRequestException("You're already registered for this event");
    }
  }

  private async isAlreadyInEvent(eventId: string, claimerUserId: string, exceptSeatId: string): Promise<boolean> {
    const [existingReg, existingSeat] = await Promise.all([
      this.prisma.eventRegistration.findFirst({
        where: {
          eventId,
          userId: claimerUserId,
          status: { not: RegistrationStatus.CANCELLED },
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
        },
        select: { id: true },
      }),
      this.prisma.groupSeat.findFirst({
        where: {
          claimedByUserId: claimerUserId,
          status: GroupSeatStatus.CLAIMED,
          // Only a seat in a live group counts: a cancelled group booking
          // leaves its seats CLAIMED, which used to block a fresh invite.
          registration: { eventId, ...ACTIVE_REGISTRATION },
          NOT: { id: exceptSeatId },
        },
        select: { id: true },
      }),
    ]);
    return !!(existingReg || existingSeat);
  }

  /**
   * Seats waiting for me: INVITED seats whose invite email is one of my
   * account's emails, on live events I'm not already in. Feeds the app's
   * "You've been invited" card so an invite isn't lost in someone's inbox.
   * Returns the claim token, which the invite email already gave this person.
   */
  async listMyInvites(userId: string) {
    const identities = await this.prisma.userIdentity.findMany({
      where: { userId, email: { not: null } },
      select: { email: true },
    });
    const emails = [...new Set(identities.map((i) => (i.email ?? '').trim().toLowerCase()).filter(Boolean))];
    if (emails.length === 0) return { invites: [] };

    const seats = await this.prisma.groupSeat.findMany({
      where: {
        status: GroupSeatStatus.INVITED,
        OR: emails.map((e) => ({ inviteEmail: { equals: e, mode: 'insensitive' as const } })),
        registration: {
          userId: { not: userId }, // never my own group's seats
          status: { not: RegistrationStatus.CANCELLED },
          event: {
            deletedAt: null,
            status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
            endDateTime: { gte: new Date() },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        inviteToken: true,
        seatIndex: true,
        registration: {
          select: {
            eventId: true,
            user: { select: { fullName: true, username: true } },
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                startDateTime: true,
                coverImageUrl: true,
                venueName: true,
                city: true,
              },
            },
          },
        },
      },
    });
    if (seats.length === 0) return { invites: [] };

    // Drop events I'm already in (same rule the claim enforces), so the card
    // never offers something that would fail.
    const eventIds = [...new Set(seats.map((s) => s.registration.eventId))];
    const [regs, claimed] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: {
          eventId: { in: eventIds },
          userId,
          status: { not: RegistrationStatus.CANCELLED },
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
        },
        select: { eventId: true },
      }),
      this.prisma.groupSeat.findMany({
        where: {
          claimedByUserId: userId,
          status: GroupSeatStatus.CLAIMED,
          registration: { eventId: { in: eventIds }, ...ACTIVE_REGISTRATION },
        },
        select: { registration: { select: { eventId: true } } },
      }),
    ]);
    const inEvent = new Set([...regs.map((r) => r.eventId), ...claimed.map((c) => c.registration.eventId)]);

    return {
      invites: seats
        .filter((s) => !inEvent.has(s.registration.eventId))
        .map((s) => ({
          token: s.inviteToken,
          seatIndex: s.seatIndex,
          invitedBy: s.registration.user?.fullName || s.registration.user?.username || null,
          event: s.registration.event,
        })),
    };
  }

  /** Claim-time info for the claim screen (seat + event). Applies hybrid auth. */
  async getClaimInfo(token: string, claimerUserId: string) {
    const seat = await this.seatByTokenOrThrow(token);
    if (seat.status === GroupSeatStatus.CLAIMED) {
      throw new BadRequestException('This seat has already been claimed');
    }
    if (seat.status === GroupSeatStatus.RELEASED) {
      throw new BadRequestException('This seat is no longer available');
    }
    await this.assertHybridAuth(seat.inviteEmail, claimerUserId);
    this.assertSeatClaimable(seat);
    const { id, title, slug } = seat.registration.event;
    return {
      seatIndex: seat.seatIndex,
      status: seat.status,
      event: { id, title, slug },
      ticketTypeId: seat.registration.ticketTypeId,
      invitedEmail: seat.inviteEmail,
      // Already has a ticket here: the app says so instead of offering a
      // claim that would fail (and lets them decline to free the seat).
      alreadyRegistered: await this.isAlreadyInEvent(seat.registration.eventId, claimerUserId, seat.id),
    };
  }

  /**
   * Claim a seat. Security-critical:
   *  - hybrid auth (bind to invited account when the email resolves),
   *  - event-wide dedupe (no double-registration),
   *  - ATOMIC guarded transition `status != CLAIMED → CLAIMED` so only one of N
   *    concurrent claimers wins the seat (W10),
   *  - the token in the guard means a revoke that rotated it makes this claim
   *    a no-op (W35) — the loser gets a clean "already taken".
   */
  async claim(
    token: string,
    claimerUserId: string,
    memberDetails?: Record<string, unknown>,
  ) {
    const seat = await this.seatByTokenOrThrow(token);
    if (seat.status === GroupSeatStatus.CLAIMED) {
      throw new BadRequestException('This seat has already been claimed');
    }
    if (seat.status === GroupSeatStatus.RELEASED) {
      throw new BadRequestException('This seat is no longer available');
    }
    await this.assertHybridAuth(seat.inviteEmail, claimerUserId);
    this.assertSeatClaimable(seat);
    await this.assertNotAlreadyInEvent(seat.registration.eventId, claimerUserId, seat.id);

    // Only an OPEN or INVITED seat can be won — this both keeps the one-winner
    // race semantics (a rotated token / already-CLAIMED loser gets a clean
    // "already taken") and makes a RELEASED seat unclaimable by construction.
    // The app never sends an email on claim (it's the account's, not typed), so
    // record the claimer's own account email on the seat, else the invite email.
    // Without it the lead's roster showed a blank email and the member's
    // details were incomplete.
    const claimerEmail = await this.primaryEmail(claimerUserId, seat.inviteEmail);
    const details: Record<string, unknown> = { ...(memberDetails ?? {}), ...(claimerEmail ? { email: claimerEmail } : {}) };

    const claimed = await this.prisma.groupSeat.updateMany({
      where: {
        inviteToken: token,
        status: { in: [GroupSeatStatus.OPEN, GroupSeatStatus.INVITED] },
      },
      data: {
        status: GroupSeatStatus.CLAIMED,
        claimedByUserId: claimerUserId,
        memberDetails: details as Prisma.InputJsonValue,
        claimedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('This seat has just been taken');
    }

    // The member's own ticket (per-CLAIMED-seat QR), linked to the group's
    // registration. Stamped with the member's name + email so their ticket can
    // be told apart from the lead's and shown in the member's Tickets tab.
    const claimerName =
      typeof memberDetails?.name === 'string' && memberDetails.name.trim() ? memberDetails.name.trim() : null;
    const ticket = await this.prisma.eventTicket.create({
      data: {
        registrationId: seat.registrationId,
        ticketCode: this.ticketCode(),
        qrCode: this.qrCode(),
        attendeeName: claimerName,
        attendeeEmail: claimerEmail,
      },
    });

    this.logger.log(
      `Seat ${seat.seatIndex} of registration ${seat.registrationId} claimed by ${claimerUserId}`,
    );

    // WhatsApp group invite for the member who just claimed — their phone is
    // only known now. Best-effort, send-once (stamps the seat), never blocks.
    void this.sendClaimWhatsAppInvite(seat.id, seat.registrationId, claimerUserId);

    // The usual "you're registered" email (with the member's own QR) and
    // WhatsApp confirmation, same as any registration. Best-effort.
    void this.sendClaimConfirmations(seat.registrationId, claimerUserId, claimerEmail, details, {
      qrCode: ticket.qrCode,
      ticketCode: ticket.ticketCode,
    });

    return {
      seatIndex: seat.seatIndex,
      event: seat.registration.event,
      ticket: { ticketCode: ticket.ticketCode, qrCode: ticket.qrCode },
    };
  }

  /** The claimer's primary (else any) account email; falls back to the invite email. */
  private async primaryEmail(userId: string, fallback: string | null): Promise<string | null> {
    // Only labels the ticket / addresses the confirmation, so it must never
    // fail a claim: any lookup error falls back to the invite email.
    try {
      const ids = await this.prisma.userIdentity.findMany({
        where: { userId, email: { not: null } },
        select: { email: true, isPrimary: true },
      });
      const pick = ids.find((i) => i.isPrimary) ?? ids[0];
      return pick?.email ?? fallback ?? null;
    } catch {
      return fallback ?? null;
    }
  }

  /**
   * Registration confirmation for a member who just claimed a seat: the ticket
   * email (their own QR + .ics) and the WhatsApp registration confirmation.
   * Mirrors what a lead gets on registering. Fully fail-soft.
   */
  private async sendClaimConfirmations(
    registrationId: string,
    claimerUserId: string,
    email: string | null,
    memberDetails: Record<string, unknown> | undefined,
    ticket: { qrCode: string; ticketCode?: string },
  ): Promise<{ email: string | null; whatsapp: boolean }> {
    const sent = { email: null as string | null, whatsapp: false };
    try {
      const [reg, user] = await Promise.all([
        this.prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: {
            event: {
              select: {
                title: true,
                slug: true,
                startDateTime: true,
                endDateTime: true,
                timezone: true,
                type: true,
                venueName: true,
                venueAddress: true,
                city: true,
                onlineUrl: true,
                description: true,
                space: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.user.findUnique({
          where: { id: claimerUserId },
          select: { fullName: true, mobileNumber: true },
        }),
      ]);
      const event = reg?.event;
      if (!event) return sent;

      const tz = event.timezone || 'Asia/Kolkata';
      const eventDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(
        event.startDateTime,
      );
      const time = (d: Date) =>
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(d);
      const eventTime = `${time(event.startDateTime)} - ${time(event.endDateTime)} IST`;
      const name =
        (typeof memberDetails?.name === 'string' && memberDetails.name.trim()) || user?.fullName || 'there';

      if (email) {
        await this.email
          .sendRegistrationConfirmation({
            email,
            userName: name,
            eventTitle: event.title,
            eventDate,
            eventTime,
            venueName: event.venueName || undefined,
            city: event.city || undefined,
            isOnline: event.type === 'ONLINE',
            onlineUrl: event.onlineUrl || undefined,
            qrCode: ticket.qrCode,
            ticketCode: ticket.ticketCode,
            eventSlug: event.slug,
            eventStartDateTime: event.startDateTime,
            eventEndDateTime: event.endDateTime,
            eventTimezone: event.timezone,
            eventType: event.type,
            venueAddress: event.venueAddress || undefined,
            eventDescription: event.description || undefined,
            organiserName: event.space?.name || undefined,
          })
          .then(() => {
            sent.email = email;
          })
          .catch((err) => this.logger.error('Failed to send claim confirmation email', err));
      }

      const mobile =
        (typeof memberDetails?.mobile === 'string' && memberDetails.mobile.trim()) || user?.mobileNumber || '';
      if (mobile) {
        await this.whatsapp
          .sendRegistrationConfirmation(mobile, {
            userName: name,
            eventTitle: event.title,
            eventDate,
            eventTime,
            venueName: event.venueName || undefined,
            city: event.city || undefined,
            isOnline: event.type === 'ONLINE',
            onlineUrl: event.onlineUrl || undefined,
          })
          .then(() => {
            sent.whatsapp = true;
          })
          .catch((err) => this.logger.error('Failed to send claim confirmation WhatsApp', err));
      }
    } catch (err) {
      this.logger.error(`Claim confirmations failed for registration ${registrationId}`, err as Error);
    }
    return sent;
  }

  /**
   * "Resend confirmation" from the attendee's ticket: the registration email
   * (with THEIR QR) and the WhatsApp registration confirmation, to the caller
   * only. The lead gets the booking's QR; a member who claimed a seat gets
   * their own seat ticket. Never re-mails the rest of the group.
   */
  async resendConfirmation(registrationId: string, userId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        userId: true,
        qrCode: true,
        status: true,
        paymentStatus: true,
        tickets: { select: { qrCode: true, ticketCode: true, attendeeEmail: true, createdAt: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (
      reg.status === RegistrationStatus.CANCELLED ||
      !([PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] as PaymentStatus[]).includes(reg.paymentStatus)
    ) {
      throw new BadRequestException('This ticket is no longer active');
    }

    const email = await this.primaryEmail(userId, null);

    if (reg.userId === userId) {
      return this.sendClaimConfirmations(registrationId, userId, email, undefined, {
        qrCode: reg.qrCode,
        ticketCode: undefined,
      });
    }

    const seat = await this.prisma.groupSeat.findFirst({
      where: { registrationId, claimedByUserId: userId, status: GroupSeatStatus.CLAIMED },
      select: { claimedAt: true, memberDetails: true },
    });
    if (!seat) throw new ForbiddenException("You don't have a ticket on this registration");

    // The seat's own ticket: stamped with the member's email on newer claims,
    // else the one created at the moment of the claim.
    const mine =
      reg.tickets.find((t) => email && t.attendeeEmail?.toLowerCase() === email.toLowerCase()) ??
      (seat.claimedAt
        ? [...reg.tickets].sort(
            (a, b) => Math.abs(+a.createdAt - +seat.claimedAt!) - Math.abs(+b.createdAt - +seat.claimedAt!),
          )[0]
        : undefined);
    if (!mine) throw new BadRequestException("We couldn't find your ticket for this seat");

    const details =
      seat.memberDetails && typeof seat.memberDetails === 'object' && !Array.isArray(seat.memberDetails)
        ? (seat.memberDetails as Record<string, unknown>)
        : undefined;
    return this.sendClaimConfirmations(registrationId, userId, email, details, {
      qrCode: mine.qrCode,
      ticketCode: mine.ticketCode,
    });
  }

  /**
   * Push the WhatsApp group invite to a member right after they claim their
   * seat, resolving the link by the registration's ticket type (same precedence
   * as everywhere else). Fully fail-soft — a claim never fails on this.
   */
  private async sendClaimWhatsAppInvite(
    seatId: string,
    registrationId: string,
    claimerUserId: string,
  ): Promise<void> {
    try {
      const [reg, claimer, currentSeat] = await Promise.all([
        this.prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: {
            ticketType: { select: { whatsappGroupUrl: true } },
            event: {
              select: {
                title: true,
                whatsappAttendeeGroupUrl: true,
                parentEvent: { select: { whatsappAttendeeGroupUrl: true } },
              },
            },
          },
        }),
        this.prisma.user.findUnique({
          where: { id: claimerUserId },
          select: { mobileNumber: true, fullName: true, username: true },
        }),
        this.prisma.groupSeat.findUnique({
          where: { id: seatId },
          select: { whatsappInviteSentAt: true, memberDetails: true },
        }),
      ]);
      if (!reg || currentSeat?.whatsappInviteSentAt) return;

      const { inviteUrl, isCommunity } = resolveRegistrationWhatsAppInvite({
        ticketTypeGroupUrl: reg.ticketType?.whatsappGroupUrl,
        eventAttendeeGroupUrl: reg.event.whatsappAttendeeGroupUrl,
        parentAttendeeGroupUrl: reg.event.parentEvent?.whatsappAttendeeGroupUrl,
      });
      if (!inviteUrl) return;

      const details = (currentSeat?.memberDetails ?? {}) as Record<string, unknown>;
      const mobile =
        claimer?.mobileNumber ||
        (typeof details.mobile === 'string' ? details.mobile : null);
      if (!mobile) return;

      await this.whatsapp.sendEventWhatsAppGroupInvite(mobile, {
        userName:
          claimer?.fullName ||
          claimer?.username ||
          (typeof details.name === 'string' ? details.name : 'there'),
        eventTitle: reg.event.title,
        inviteUrl,
        isCommunity,
      });
      await this.prisma.groupSeat.update({
        where: { id: seatId },
        data: { whatsappInviteSentAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send claim-time WhatsApp invite for seat ${seatId}`,
        error,
      );
    }
  }

  /** Decline an invite → seat back to OPEN (token rotated); notify the lead. */
  async decline(token: string, userId: string) {
    const seat = await this.seatByTokenOrThrow(token);
    // Same rule as claiming: only the invited account can turn it down.
    await this.assertHybridAuth(seat.inviteEmail, userId);
    const res = await this.prisma.groupSeat.updateMany({
      where: { inviteToken: token, status: GroupSeatStatus.INVITED },
      data: {
        status: GroupSeatStatus.OPEN,
        inviteEmail: null,
        inviteToken: GroupSeatsService.newToken(),
        reminderSentAt: null,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException('This invite is no longer active');
    }

    // Notify the lead a seat re-opened (best-effort).
    const lead = await this.prisma.eventRegistration.findUnique({
      where: { id: seat.registrationId },
      select: { userId: true, event: { select: { title: true } } },
    });
    if (lead) {
      const identity = await this.prisma.userIdentity.findFirst({
        where: { userId: lead.userId, email: { not: null }, isPrimary: true },
        select: { email: true },
      });
      if (identity?.email) {
        this.email
          .sendRawEmail(
            identity.email,
            `A seat re-opened for ${lead.event.title}`,
            `<p>An invited member declined their seat for <strong>${lead.event.title}</strong>. The seat is open again — you can invite someone else from your registration.</p>`,
          )
          .catch(() => undefined);
      }
    }
    return { seatIndex: seat.seatIndex, status: GroupSeatStatus.OPEN };
  }

  /**
   * Notify every CLAIMED member that the lead cancelled the whole group, so
   * their ticket is gone. Best-effort; members always have an account.
   */
  async notifyGroupCancelled(registrationId: string, eventTitle: string) {
    const claimed = await this.prisma.groupSeat.findMany({
      where: { registrationId, status: GroupSeatStatus.CLAIMED, claimedByUserId: { not: null } },
      select: { claimedByUserId: true },
    });
    const userIds = claimed
      .map((s) => s.claimedByUserId)
      .filter((id): id is string => !!id);
    if (userIds.length === 0) return;

    const identities = await this.prisma.userIdentity.findMany({
      where: { userId: { in: userIds }, isPrimary: true, email: { not: null } },
      select: { email: true },
    });
    for (const { email } of identities) {
      if (!email) continue;
      this.email
        .sendRawEmail(
          email,
          `Your seat for ${eventTitle} was cancelled`,
          `<p>The organiser of your group booking cancelled the registration for <strong>${eventTitle}</strong>, so your ticket is no longer valid. If you believe this is a mistake, please contact the person who invited you.</p>`,
        )
        .catch((err) => this.logger.error(`Group-cancel email failed to ${email}`, err));
    }
  }

  /**
   * Once a day, remind still-INVITED seats whose event starts within 48 hours to
   * claim. `reminderSentAt` makes it idempotent — each invite is nudged once.
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async sendClaimReminders() {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const seats = await this.prisma.groupSeat.findMany({
      where: {
        status: GroupSeatStatus.INVITED,
        reminderSentAt: null,
        inviteEmail: { not: null },
        registration: {
          status: { not: RegistrationStatus.CANCELLED },
          event: { startDateTime: { gt: now, lte: in48h } },
        },
      },
      select: {
        id: true,
        inviteEmail: true,
        inviteToken: true,
        registration: { select: { event: { select: { title: true } } } },
      },
      take: 500,
    });
    if (seats.length === 0) return;

    let sent = 0;
    for (const seat of seats) {
      if (!seat.inviteEmail) continue;
      try {
        // Claim the seat BEFORE sending. `reminderSentAt: null` in the findMany
        // only blocks the NEXT 6-hourly run — all 3 replicas' runs overlap and
        // would each see the same null rows and send. This atomic updateMany
        // (only one caller flips null→now, count === 1) is the real guard; mark
        // first so a send failure leaves it marked (a missed nudge beats a
        // triple one).
        const claimed = await this.prisma.groupSeat.updateMany({
          where: { id: seat.id, reminderSentAt: null },
          data: { reminderSentAt: new Date() },
        });
        if (claimed.count === 0) continue; // another replica already nudged this

        await this.email.sendRawEmail(
          seat.inviteEmail,
          `Reminder: claim your seat for ${seat.registration.event.title}`,
          this.inviteHtml(
            seat.registration.event.title,
            this.claimUrl(seat.inviteToken),
          ),
        );
        sent++;
      } catch (err) {
        this.logger.error(`Claim reminder failed for seat ${seat.id}`, err);
      }
    }
    this.logger.log(`Sent ${sent} claim reminder(s)`);
  }

  private inviteHtml(eventTitle: string, claimUrl: string): string {
    return [
      `<p>You've been invited to join <strong>${eventTitle}</strong> on Unifesto.</p>`,
      `<p><a href="${claimUrl}" style="display:inline-block;padding:12px 20px;background:#3491ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Claim your seat</a></p>`,
      `<p style="color:#6b7280;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
    ].join('');
  }
}
