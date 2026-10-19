import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { QuestionsService } from './questions.service';
import { AskQuestionDto, ModerateQuestionDto, QaSettingsDto } from './questions.dto';

const optionalUuid = new ParseUUIDPipe({ optional: true });

@ApiTags('questions')
@Controller('events/:eventId/questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  // ---- Attendees (and operators): the live panel ----

  @Get()
  @UseGuards(JwtAuthGuard)
  feed(@Param('eventId') eventId: string, @CurrentUser() user: User, @Query('agendaId', optionalUuid) agendaId?: string) {
    return this.questions.feed(eventId, user.id, agendaId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  ask(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: AskQuestionDto) {
    return this.questions.ask(eventId, user.id, dto);
  }

  @Post(':questionId/vote')
  @UseGuards(JwtAuthGuard)
  vote(@Param('eventId') eventId: string, @Param('questionId', ParseUUIDPipe) questionId: string, @CurrentUser() user: User) {
    return this.questions.vote(eventId, questionId, user.id);
  }

  @Delete(':questionId/vote')
  @UseGuards(JwtAuthGuard)
  unvote(@Param('eventId') eventId: string, @Param('questionId', ParseUUIDPipe) questionId: string, @CurrentUser() user: User) {
    return this.questions.unvote(eventId, questionId, user.id);
  }

  // ---- Organisers: moderating is running the event's content, event:edit ----

  @Get('manage')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  list(@Param('eventId') eventId: string, @Query('agendaId', optionalUuid) agendaId?: string) {
    return this.questions.listForManage(eventId, agendaId);
  }

  // Declared before ':questionId' so "settings" isn't read as a question id.
  @Patch('settings')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  settings(@Param('eventId') eventId: string, @Body() dto: QaSettingsDto) {
    return this.questions.setPremoderated(eventId, dto.premoderated);
  }

  @Patch(':questionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  moderate(
    @Param('eventId') eventId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: ModerateQuestionDto,
  ) {
    return this.questions.moderate(eventId, questionId, dto);
  }
}
