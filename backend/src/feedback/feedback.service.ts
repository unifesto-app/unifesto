import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventFeedbackQuestion, EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING, isAttending } from '../common/attendance';
import { NotifyService } from '../notifications/notify.service';
import { FEEDBACK_SUBMITTED, type FeedbackSubmittedEvent } from './feedback.events';
import {
  checkAnswers,
  checkFieldDefinition,
  sanitizeConfig,
  showIfOf,
} from '../registrations/form-answers.util';
import { CreateStayQuestionDto as QuestionDto, UpdateStayQuestionDto as UpdateQuestionDto } from '../stays/dto';
import { SubmitFeedbackDto } from './feedback.dto';

const HOUR = 3_600_000;
/** F2 timing, counted from the event's end. */
export const FEEDBACK_REQUEST_AFTER = 2 * HOUR;
export const FEEDBACK_REMINDER_AFTER = 48 * HOUR;
export const FEEDBACK_CLOSES_AFTER = 7 * 24 * HOUR;

/**
 * F1: per-event attendee feedback. A fixed 1-5 rating and NPS, then the
 * curators' own questions (registration question types and rules, minus
 * file uploads). One response per attendee, which they can edit.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly events: EventEmitter2,
  ) {}

  private async loadEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        feedbackEnabled: true,
        feedbackUnlocksCertificate: true,
        deletedAt: true,
      },
    });
    if (!event || event.deletedAt) throw new NotFoundException('Event not found');
    return event;
  }

  private questions(eventId: string) {
    return this.prisma.eventFeedbackQuestion.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
  }

  private closesAt(event: { endDateTime: Date }) {
    return new Date(event.endDateTime.getTime() + FEEDBACK_CLOSES_AFTER);
  }

  /** Feedback opens when the event starts and closes 7 days after it ends (F2). */
  private isOpen(event: { feedbackEnabled: boolean; startDateTime: Date; endDateTime: Date }, now = new Date()) {
    return event.feedbackEnabled && event.startDateTime <= now && now <= this.closesAt(event);
  }

  // ───────────────────────────── attendee ─────────────────────────────

  /** The form, whether it is open, and the caller's own response if any. */
  async getForAttendee(userId: string, eventId: string) {
    const event = await this.loadEvent(eventId);
    const [attending, questions, response] = await Promise.all([
      isAttending(this.prisma, eventId, userId),
      this.questions(eventId),
      this.prisma.eventFeedbackResponse.findUnique({ where: { eventId_userId: { eventId, userId } } }),
    ]);
    return {
      event: { id: event.id, title: event.title },
      enabled: event.feedbackEnabled,
      open: attending && this.isOpen(event),
      closesAt: this.closesAt(event),
      unlocksCertificate: event.feedbackUnlocksCertificate,
      questions,
      response,
    };
  }

  /** Create or replace the caller's response. Attendees only, while open. */
  async submit(userId: string, eventId: string, dto: SubmitFeedbackDto) {
    const event = await this.loadEvent(eventId);
    if (!event.feedbackEnabled) throw new BadRequestException('Feedback is off for this event');
    if (!this.isOpen(event)) {
      throw new BadRequestException(
        event.startDateTime > new Date() ? 'Feedback opens when the event starts' : 'Feedback for this event has closed',
      );
    }
    if (!(await isAttending(this.prisma, eventId, userId))) {
      throw new ForbiddenException('Only attendees can give feedback');
    }
    const { answers, errors } = checkAnswers(await this.questions(eventId), dto.answers, {
      eventId,
      enforceRequired: true,
      uploaderIds: [userId],
    });
    if (errors.length) throw new BadRequestException(errors.join(' '));
    const data = {
      rating: dto.rating,
      nps: dto.nps ?? null,
      comment: dto.comment?.trim() || null,
      answers: answers as Prisma.InputJsonObject,
    };
    const saved = await this.prisma.eventFeedbackResponse.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, ...data },
      update: data,
    });
    this.events.emit(FEEDBACK_SUBMITTED, { eventId, userId } satisfies FeedbackSubmittedEvent);
    return saved;
  }

  /**
   * F2 sweep: ask checked-in attendees 2 h after the end, remind those who
   * haven't answered at 48 h. Each stage is stamped on the event before
   * sending, so it runs once however often the sweep fires; notify() also
   * dedups per attendee. Reminders only follow a request, so events that ended
   * before this shipped are left alone.
   */
  async sendDue(now = new Date()) {
    let sent = 0;
    const stages = [
      { stamp: 'feedbackRequestedAt', after: FEEDBACK_REQUEST_AFTER, until: FEEDBACK_REMINDER_AFTER, extra: {} },
      {
        stamp: 'feedbackRemindedAt',
        after: FEEDBACK_REMINDER_AFTER,
        until: FEEDBACK_CLOSES_AFTER,
        extra: { feedbackRequestedAt: { not: null } },
      },
    ] as const;
    for (const stage of stages) {
      const due = await this.prisma.event.findMany({
        where: {
          feedbackEnabled: true,
          deletedAt: null,
          status: { not: EventStatus.CANCELLED },
          [stage.stamp]: null,
          ...stage.extra,
          endDateTime: { lte: new Date(now.getTime() - stage.after), gt: new Date(now.getTime() - stage.until) },
        },
        select: { id: true, title: true, endDateTime: true },
        take: 50,
      });
      for (const event of due) {
        const claimed = await this.prisma.event.updateMany({
          where: { id: event.id, [stage.stamp]: null },
          data: { [stage.stamp]: now },
        });
        if (!claimed.count) continue; // another replica took it
        const closesText = this.closesAt(event).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          timeZone: 'Asia/Kolkata',
        });
        for (const userId of await this.checkedInWithoutFeedback(event.id)) {
          const data = { eventId: event.id, eventTitle: event.title };
          if (stage.stamp === 'feedbackRequestedAt') await this.notify.notify(userId, 'feedback.request', data);
          else await this.notify.notify(userId, 'feedback.reminder', { ...data, closesText });
          sent++;
        }
      }
    }
    return { sent };
  }

  /** Accounts that checked in (bookings and group members) and haven't answered yet. */
  private async checkedInWithoutFeedback(eventId: string): Promise<string[]> {
    const [regs, members, answered] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { eventId, ...COUNTS_AS_ATTENDING, checkedInAt: { not: null } },
        select: { userId: true },
      }),
      this.prisma.eventGroupMemberCheckin.findMany({
        where: { registration: { eventId, ...COUNTS_AS_ATTENDING }, groupSeat: { claimedByUserId: { not: null } } },
        select: { groupSeat: { select: { claimedByUserId: true } } },
      }),
      this.prisma.eventFeedbackResponse.findMany({ where: { eventId }, select: { userId: true } }),
    ]);
    const done = new Set(answered.map((a) => a.userId));
    const ids = [...regs.map((r) => r.userId), ...members.map((m) => m.groupSeat?.claimedByUserId)];
    return [...new Set(ids.filter((id): id is string => !!id && !done.has(id)))];
  }

  // ───────────────────────────── curators (event:edit) ─────────────────────────────

  async getForTeam(eventId: string) {
    const event = await this.loadEvent(eventId);
    return {
      enabled: event.feedbackEnabled,
      unlocksCertificate: event.feedbackUnlocksCertificate,
      questions: await this.questions(eventId),
    };
  }

  async setSettings(eventId: string, s: { enabled?: boolean; unlocksCertificate?: boolean }) {
    await this.loadEvent(eventId);
    await this.prisma.event.update({
      where: { id: eventId },
      data: { feedbackEnabled: s.enabled, feedbackUnlocksCertificate: s.unlocksCertificate },
    });
    return this.getForTeam(eventId);
  }

  private async assertValidQuestion(eventId: string, def: Parameters<typeof checkFieldDefinition>[0]) {
    if (def.type === 'FILE') throw new BadRequestException("Feedback questions can't ask for files");
    const siblings = await this.questions(eventId);
    const err = checkFieldDefinition(
      def,
      siblings.filter((s) => s.id !== def.id).map((s) => ({ ...s, perGroup: false })),
    );
    if (err) throw new BadRequestException(err.replace('on this ticket', 'on this form'));
  }

  private questionData(q: Pick<EventFeedbackQuestion, 'type'>, config: unknown, showIfRaw: unknown) {
    const showIf = showIfOf({ showIf: showIfRaw });
    return {
      config: (config as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
      showIf: showIf ? { fieldId: showIf.fieldId, anyOf: showIf.anyOf } : Prisma.DbNull,
    };
  }

  async createQuestion(eventId: string, dto: QuestionDto) {
    await this.loadEvent(eventId);
    const options = (dto.options || []).map((o) => o.trim()).filter(Boolean);
    const config = sanitizeConfig(dto.type, dto.config);
    const order = dto.order ?? (await this.prisma.eventFeedbackQuestion.count({ where: { eventId } }));
    await this.assertValidQuestion(eventId, {
      type: dto.type,
      options,
      perGroup: false,
      order,
      config,
      showIf: dto.showIf ?? null,
    });
    await this.prisma.eventFeedbackQuestion.create({
      data: {
        eventId,
        label: dto.label.trim(),
        type: dto.type,
        options,
        isRequired: dto.type === 'SECTION' ? false : (dto.isRequired ?? false),
        order,
        helpText: dto.helpText?.trim() || null,
        ...this.questionData(dto, config, dto.showIf),
      },
    });
    return this.getForTeam(eventId);
  }

  async updateQuestion(eventId: string, questionId: string, dto: UpdateQuestionDto) {
    const q = await this.prisma.eventFeedbackQuestion.findUnique({ where: { id: questionId } });
    if (!q || q.eventId !== eventId) throw new NotFoundException('Question not found');
    const type = dto.type ?? q.type;
    const options = dto.options ? dto.options.map((o) => o.trim()).filter(Boolean) : q.options;
    const config = sanitizeConfig(type, dto.config === undefined ? q.config : dto.config);
    const showIfRaw = dto.showIf === undefined ? q.showIf : dto.showIf;
    await this.assertValidQuestion(eventId, {
      id: q.id,
      type,
      options,
      perGroup: false,
      order: dto.order ?? q.order,
      config,
      showIf: showIfRaw ?? null,
    });
    await this.prisma.eventFeedbackQuestion.update({
      where: { id: questionId },
      data: {
        label: dto.label?.trim(),
        type,
        options,
        isRequired: type === 'SECTION' ? false : dto.isRequired,
        order: dto.order,
        helpText: dto.helpText === undefined ? undefined : dto.helpText?.trim() || null,
        ...this.questionData({ type }, config, showIfRaw),
      },
    });
    return this.getForTeam(eventId);
  }

  async removeQuestion(eventId: string, questionId: string) {
    const { count } = await this.prisma.eventFeedbackQuestion.deleteMany({ where: { id: questionId, eventId } });
    if (!count) throw new NotFoundException('Question not found');
    return this.getForTeam(eventId);
  }
}
