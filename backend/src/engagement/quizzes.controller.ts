import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { QuizzesService } from './quizzes.service';
import { AnswerQuizDto, SaveQuizDto } from './quizzes.dto';

@Controller('events/:eventId/quizzes')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  // ---- Attendees (and operators): the live panel ----

  @Get()
  @UseGuards(JwtAuthGuard)
  feed(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.quizzes.feed(eventId, user.id);
  }

  @Post(':quizId/answer')
  @UseGuards(JwtAuthGuard)
  answer(
    @Param('eventId') eventId: string,
    @Param('quizId') quizId: string,
    @CurrentUser() user: User,
    @Body() dto: AnswerQuizDto,
  ) {
    return this.quizzes.answer(
      eventId,
      quizId,
      user.id,
      dto.questionId,
      dto.optionIndex,
    );
  }

  // ---- Organisers: running the event's content is event:edit ----

  @Get('manage')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  list(@Param('eventId') eventId: string) {
    return this.quizzes.listForManage(eventId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  create(@Param('eventId') eventId: string, @Body() dto: SaveQuizDto) {
    return this.quizzes.create(eventId, dto);
  }

  @Put(':quizId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  update(
    @Param('eventId') eventId: string,
    @Param('quizId') quizId: string,
    @Body() dto: SaveQuizDto,
  ) {
    return this.quizzes.update(eventId, quizId, dto);
  }

  @Post(':quizId/start')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  start(@Param('eventId') eventId: string, @Param('quizId') quizId: string) {
    return this.quizzes.start(eventId, quizId);
  }

  @Post(':quizId/next')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  next(@Param('eventId') eventId: string, @Param('quizId') quizId: string) {
    return this.quizzes.next(eventId, quizId);
  }

  @Post(':quizId/close-question')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  closeQuestion(
    @Param('eventId') eventId: string,
    @Param('quizId') quizId: string,
  ) {
    return this.quizzes.closeQuestion(eventId, quizId);
  }

  @Post(':quizId/end')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  end(@Param('eventId') eventId: string, @Param('quizId') quizId: string) {
    return this.quizzes.end(eventId, quizId);
  }

  @Delete(':quizId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  remove(@Param('eventId') eventId: string, @Param('quizId') quizId: string) {
    return this.quizzes.remove(eventId, quizId);
  }
}
