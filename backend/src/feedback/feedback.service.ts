import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventFeedbackQuestion, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isAttending } from '../common/attendance';
import {
  checkAnswers,
  checkFieldDefinition,
  sanitizeConfig,
  showIfOf,
} from '../registrations/form-answers.util';
import { CreateStayQuestionDto as QuestionDto, UpdateStayQuestionDto as UpdateQuestionDto } from '../stays/dto';
import { SubmitFeedbackDto } from './feedback.dto';

/**
 * F1: per-event attendee feedback. A fixed 1-5 rating and NPS, then the
 * curators' own questions (registration question types and rules, minus
 * file uploads). One response per attendee, which they can edit.
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, startDateTime: true, endDateTime: true, feedbackEnabled: true, deletedAt: true },
    });
    if (!event || event.deletedAt) throw new NotFoundException('Event not found');
    return event;
  }

  private questions(eventId: string) {
    return this.prisma.eventFeedbackQuestion.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
  }

  /** Feedback opens when the event starts. */
  private isOpen(event: { feedbackEnabled: boolean; startDateTime: Date }, now = new Date()) {
    return event.feedbackEnabled && event.startDateTime <= now;
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
      questions,
      response,
    };
  }

  /** Create or replace the caller's response. Attendees only, while open. */
  async submit(userId: string, eventId: string, dto: SubmitFeedbackDto) {
    const event = await this.loadEvent(eventId);
    if (!event.feedbackEnabled) throw new BadRequestException('Feedback is off for this event');
    if (!this.isOpen(event)) throw new BadRequestException('Feedback opens when the event starts');
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
    return this.prisma.eventFeedbackResponse.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, ...data },
      update: data,
    });
  }

  // ───────────────────────────── curators (event:edit) ─────────────────────────────

  async getForTeam(eventId: string) {
    const event = await this.loadEvent(eventId);
    return { enabled: event.feedbackEnabled, questions: await this.questions(eventId) };
  }

  async setEnabled(eventId: string, enabled: boolean) {
    await this.loadEvent(eventId);
    await this.prisma.event.update({ where: { id: eventId }, data: { feedbackEnabled: enabled } });
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
