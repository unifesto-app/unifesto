import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, GroupSeatStatus, Prisma, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { enforceFormAnswers } from './form-answers.policy';

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

export interface EditWindowEvent {
  status: EventStatus;
  endDateTime: Date;
  attendeeEditsEnabled: boolean;
  attendeeEditsUntil: Date | null;
}

/**
 * Whether attendees may edit their own details right now, and why not if not.
 * Curators aren't bound by this (they edit through their own routes).
 */
export function editWindow(event: EditWindowEvent, now = new Date()): { open: boolean; reason: string | null } {
  if (event.status === EventStatus.CANCELLED) return { open: false, reason: 'This event was cancelled.' };
  if (event.status === EventStatus.COMPLETED || event.endDateTime.getTime() < now.getTime()) {
    return { open: false, reason: 'This event has ended.' };
  }
  if (!event.attendeeEditsEnabled) return { open: false, reason: "The organiser isn't taking changes to details." };
  if (event.attendeeEditsUntil && event.attendeeEditsUntil.getTime() <= now.getTime()) {
    return { open: false, reason: 'Changes to details closed on the organiser’s deadline.' };
  }
  return { open: true, reason: null };
}

export interface TeamWindowEvent {
  status: EventStatus;
  endDateTime: Date;
  allowTeamChanges: boolean;
  teamChangesUntil: Date | null;
}

/**
 * Whether a group lead may change their team right now (replace, add or remove
 * members, hand over the lead), and why not if not. Curators aren't bound by it.
 * A hackathon team that has submitted is locked separately (see TeamChangesService).
 */
export function teamChangeWindow(event: TeamWindowEvent, now = new Date()): { open: boolean; reason: string | null } {
  if (event.status === EventStatus.CANCELLED) return { open: false, reason: 'This event was cancelled.' };
  if (event.status === EventStatus.COMPLETED || event.endDateTime.getTime() < now.getTime()) {
    return { open: false, reason: 'This event has ended, so the team can no longer change.' };
  }
  if (!event.allowTeamChanges) return { open: false, reason: "The organiser hasn't turned on team changes for this event." };
  if (event.teamChangesUntil && event.teamChangesUntil.getTime() <= now.getTime()) {
    return { open: false, reason: 'Team changes closed on the organiser’s deadline.' };
  }
  return { open: true, reason: null };
}

/** An ISO string / null / undefined from a DTO → Date / null / undefined, or a 400. */
function parseDeadline(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  const d = v ? new Date(v) : null;
  if (d && Number.isNaN(d.getTime())) throw new BadRequestException('Give the deadline as a date and time');
  return d;
}

export interface DetailsUpdate {
  /** Registration-level answers: a solo attendee's, or a group's team-wide ones. */
  formResponses?: Json;
  /** A group member's own name and per-member answers. */
  name?: string;
  customFields?: Json;
}

const eventSelect = {
  id: true,
  slug: true,
  status: true,
  endDateTime: true,
  allowTeamChanges: true,
  teamChangesUntil: true,
  attendeeEditsEnabled: true,
  attendeeEditsUntil: true,
} satisfies Prisma.EventSelect;

/**
 * Editing registration details after booking (4.0.5), and the curator
 * controls that gate it.
 *
 * Who edits what: a solo attendee edits their answers; a group lead edits the
 * team-wide answers and their own member answers (seat 1); a claimed member
 * edits their own seat. All through the same answer policy as booking. Curators
 * can edit any registration or seat at any time, with required answers not
 * forced (they may be fixing partial data).
 */
@Injectable()
export class AttendeeDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ---- Curator controls ----

  async setControls(
    eventId: string,
    dto: {
      allowTeamChanges?: boolean;
      teamChangesUntil?: string | null;
      attendeeEditsEnabled?: boolean;
      attendeeEditsUntil?: string | null;
    },
  ) {
    const until = parseDeadline(dto.attendeeEditsUntil);
    const teamUntil = parseDeadline(dto.teamChangesUntil);
    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.allowTeamChanges !== undefined ? { allowTeamChanges: dto.allowTeamChanges } : {}),
        ...(teamUntil !== undefined ? { teamChangesUntil: teamUntil } : {}),
        ...(dto.attendeeEditsEnabled !== undefined ? { attendeeEditsEnabled: dto.attendeeEditsEnabled } : {}),
        ...(until !== undefined ? { attendeeEditsUntil: until } : {}),
      },
      select: eventSelect,
    });
    // The event payload is cached under whatever it was fetched by: slug or id.
    await Promise.all([this.cache.invalidateEventCache(event.slug), this.cache.invalidateEventCache(event.id)]);
    return {
      allowTeamChanges: event.allowTeamChanges,
      teamChangesUntil: event.teamChangesUntil,
      teamChangesOpen: teamChangeWindow(event).open,
      attendeeEditsEnabled: event.attendeeEditsEnabled,
      attendeeEditsUntil: event.attendeeEditsUntil,
      attendeeEditsOpen: editWindow(event).open,
    };
  }

  // ---- Attendee ----

  private async loadForAttendee(registrationId: string, userId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        userId: true,
        status: true,
        eventId: true,
        ticketTypeId: true,
        groupSize: true,
        formResponses: true,
        event: { select: eventSelect },
        groupSeats: {
          where: { status: GroupSeatStatus.CLAIMED },
          select: { id: true, seatIndex: true, claimedByUserId: true, memberDetails: true },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });
    if (!reg || reg.status === RegistrationStatus.CANCELLED) throw new NotFoundException('Registration not found');
    const isGroup = (reg.groupSize ?? 0) > 1;
    const isOwner = reg.userId === userId;
    // The lead's own member answers live on seat 1; a member's on the seat they claimed.
    const seat = isGroup
      ? reg.groupSeats.find((s) => (isOwner ? s.seatIndex === 1 : s.claimedByUserId === userId)) ?? null
      : null;
    if (!isOwner && !seat) throw new NotFoundException('Registration not found');
    const role: 'solo' | 'lead' | 'member' = !isGroup ? 'solo' : isOwner ? 'lead' : 'member';
    return { reg, isGroup, role, seat };
  }

  async getMine(registrationId: string, userId: string) {
    const { reg, isGroup, role, seat } = await this.loadForAttendee(registrationId, userId);
    const window = editWindow(reg.event);
    const details = asObject(seat?.memberDetails);
    return {
      registrationId: reg.id,
      eventId: reg.eventId,
      ticketTypeId: reg.ticketTypeId,
      isGroup,
      role,
      editable: window.open,
      lockedReason: window.reason,
      editsUntil: reg.event.attendeeEditsUntil,
      // Members never see (or change) the team-wide answers.
      formResponses: role === 'member' ? null : asObject(reg.formResponses),
      member: seat
        ? {
            seatIndex: seat.seatIndex,
            name: typeof details.name === 'string' ? details.name : null,
            customFields: asObject(details.customFields),
          }
        : null,
    };
  }

  async updateMine(registrationId: string, userId: string, dto: DetailsUpdate) {
    const { reg, isGroup, role, seat } = await this.loadForAttendee(registrationId, userId);
    const window = editWindow(reg.event);
    if (!window.open) throw new BadRequestException(window.reason ?? 'Details can’t be changed right now');
    if (dto.formResponses && role === 'member') {
      throw new BadRequestException('Only the team lead can change the team’s answers');
    }
    await this.apply(reg, isGroup, seat, dto, { uploaderIds: [userId], enforceRequired: true });
    return this.getMine(registrationId, userId);
  }

  // ---- Curator ----

  async getForCurator(eventId: string, registrationId: string) {
    const reg = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: {
        id: true,
        eventId: true,
        ticketTypeId: true,
        groupSize: true,
        formResponses: true,
        groupSeats: {
          select: { seatIndex: true, status: true, claimedByUserId: true, memberDetails: true, inviteEmail: true },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    return {
      registrationId: reg.id,
      eventId: reg.eventId,
      ticketTypeId: reg.ticketTypeId,
      isGroup: (reg.groupSize ?? 0) > 1,
      formResponses: asObject(reg.formResponses),
      seats: reg.groupSeats.map((s) => {
        const d = asObject(s.memberDetails);
        return {
          seatIndex: s.seatIndex,
          status: s.status,
          name: typeof d.name === 'string' ? d.name : null,
          email: typeof d.email === 'string' ? d.email : s.inviteEmail,
          customFields: asObject(d.customFields),
        };
      }),
    };
  }

  async updateForCurator(eventId: string, registrationId: string, curatorId: string, dto: DetailsUpdate & { seatIndex?: number }) {
    const reg = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: {
        id: true,
        userId: true,
        eventId: true,
        ticketTypeId: true,
        groupSize: true,
        formResponses: true,
        groupSeats: {
          where: { status: GroupSeatStatus.CLAIMED },
          select: { id: true, seatIndex: true, claimedByUserId: true, memberDetails: true },
        },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const isGroup = (reg.groupSize ?? 0) > 1;
    let seat: (typeof reg.groupSeats)[number] | null = null;
    if (dto.name !== undefined || dto.customFields !== undefined) {
      if (!isGroup) throw new BadRequestException('A solo registration has no member details; edit its answers instead');
      seat = reg.groupSeats.find((s) => s.seatIndex === dto.seatIndex) ?? null;
      if (!seat) throw new BadRequestException('Pick a filled seat to edit');
    }
    const uploaderIds = [reg.userId, curatorId, ...(seat?.claimedByUserId ? [seat.claimedByUserId] : [])];
    await this.apply(reg, isGroup, seat, dto, { uploaderIds, enforceRequired: false });
    return this.getForCurator(eventId, registrationId);
  }

  // ---- Shared ----

  private async apply(
    reg: { id: string; eventId: string; ticketTypeId: string | null },
    isGroup: boolean,
    seat: { id: string; memberDetails: unknown } | null,
    dto: DetailsUpdate,
    opts: { uploaderIds: string[]; enforceRequired: boolean },
  ) {
    const changesMember = dto.name !== undefined || dto.customFields !== undefined;
    if (!dto.formResponses && !changesMember) throw new BadRequestException('Nothing to change');
    if (changesMember && !seat) throw new BadRequestException('There are no member details to change here');

    let formResponses: Json | undefined;
    if (dto.formResponses) {
      formResponses = await enforceFormAnswers(this.prisma, {
        eventId: reg.eventId,
        ticketTypeId: reg.ticketTypeId,
        isGroup,
        formResponses: dto.formResponses,
        required: { team: opts.enforceRequired, members: 'none' },
        uploaderIds: opts.uploaderIds,
      });
    }

    let memberDetails: Json | undefined;
    let newName: string | undefined;
    if (changesMember && seat) {
      const current = asObject(seat.memberDetails);
      const member = { customFields: dto.customFields ?? asObject(current.customFields) };
      if (dto.customFields !== undefined) {
        await enforceFormAnswers(this.prisma, {
          eventId: reg.eventId,
          ticketTypeId: reg.ticketTypeId,
          isGroup: true,
          members: [member],
          required: { team: false, members: opts.enforceRequired ? 'all' : 'none' },
          uploaderIds: opts.uploaderIds,
        });
      }
      if (dto.name !== undefined) {
        newName = dto.name.trim();
        if (!newName) throw new BadRequestException('Name can’t be empty');
      }
      memberDetails = { ...current, ...(newName ? { name: newName } : {}), customFields: member.customFields };
    }

    await this.prisma.$transaction(async (tx) => {
      if (formResponses) {
        await tx.eventRegistration.update({
          where: { id: reg.id },
          data: { formResponses: formResponses as Prisma.InputJsonValue },
        });
      }
      if (memberDetails && seat) {
        await tx.groupSeat.update({
          where: { id: seat.id },
          data: { memberDetails: memberDetails as Prisma.InputJsonValue },
        });
        // Keep the member's own ticket labelled with their current name.
        const email = typeof memberDetails.email === 'string' ? memberDetails.email : null;
        if (newName && email) {
          await tx.eventTicket.updateMany({
            where: { registrationId: reg.id, attendeeEmail: { equals: email, mode: 'insensitive' } },
            data: { attendeeName: newName },
          });
        }
      }
    });
  }
}
