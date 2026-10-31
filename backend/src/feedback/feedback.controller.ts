import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { CreateStayQuestionDto as QuestionDto, UpdateStayQuestionDto as UpdateQuestionDto } from '../stays/dto';
import { FeedbackSettingsDto, SubmitFeedbackDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * F1 event feedback. Attendees read and submit their own response; the form
 * itself (on/off and questions) needs event:edit.
 */
@Controller('events/:eventId/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: User, @Param('eventId', uuid) eventId: string) {
    return this.feedback.getForAttendee(user.id, eventId);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  submit(@CurrentUser() user: User, @Param('eventId', uuid) eventId: string, @Body() dto: SubmitFeedbackDto) {
    return this.feedback.submit(user.id, eventId, dto);
  }

  @Get('manage')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  getForTeam(@Param('eventId', uuid) eventId: string) {
    return this.feedback.getForTeam(eventId);
  }

  @Get('results')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  results(@Param('eventId', uuid) eventId: string) {
    return this.feedback.results(eventId);
  }

  @Get('results.csv')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  resultsCsv(@Param('eventId', uuid) eventId: string) {
    return this.feedback.resultsCsv(eventId);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  setSettings(@Param('eventId', uuid) eventId: string, @Body() dto: FeedbackSettingsDto) {
    return this.feedback.setSettings(eventId, dto);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  createQuestion(@Param('eventId', uuid) eventId: string, @Body() dto: QuestionDto) {
    return this.feedback.createQuestion(eventId, dto);
  }

  @Patch('questions/:questionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  updateQuestion(
    @Param('eventId', uuid) eventId: string,
    @Param('questionId', uuid) questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.feedback.updateQuestion(eventId, questionId, dto);
  }

  @Delete('questions/:questionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  removeQuestion(@Param('eventId', uuid) eventId: string, @Param('questionId', uuid) questionId: string) {
    return this.feedback.removeQuestion(eventId, questionId);
  }
}
