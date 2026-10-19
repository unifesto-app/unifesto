import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { PollsService } from './polls.service';
import { CreatePollDto, UpdatePollDto, VotePollDto } from './polls.dto';

@ApiTags('polls')
@Controller('events/:eventId/polls')
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  // ---- Attendees (and operators): the live panel ----

  @Get()
  @UseGuards(JwtAuthGuard)
  feed(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.polls.feed(eventId, user.id);
  }

  @Post(':pollId/vote')
  @UseGuards(JwtAuthGuard)
  vote(
    @Param('eventId') eventId: string,
    @Param('pollId') pollId: string,
    @CurrentUser() user: User,
    @Body() dto: VotePollDto,
  ) {
    return this.polls.vote(eventId, pollId, user.id, dto.optionIndex);
  }

  // ---- Organisers: running the event's content is event:edit ----

  @Get('manage')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  list(@Param('eventId') eventId: string) {
    return this.polls.listForManage(eventId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  create(@Param('eventId') eventId: string, @Body() dto: CreatePollDto) {
    return this.polls.create(eventId, dto);
  }

  @Post(':pollId/launch')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  launch(@Param('eventId') eventId: string, @Param('pollId') pollId: string) {
    return this.polls.launch(eventId, pollId);
  }

  @Post(':pollId/close')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  close(@Param('eventId') eventId: string, @Param('pollId') pollId: string) {
    return this.polls.close(eventId, pollId);
  }

  @Patch(':pollId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  update(@Param('eventId') eventId: string, @Param('pollId') pollId: string, @Body() dto: UpdatePollDto) {
    return this.polls.setVisibility(eventId, pollId, dto.resultsVisibility);
  }

  @Delete(':pollId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  remove(@Param('eventId') eventId: string, @Param('pollId') pollId: string) {
    return this.polls.remove(eventId, pollId);
  }
}
