import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { uploadLimit } from '../common/upload-limits';
import { FILE_MAX_MB_CAP } from '../registrations/form-answers.util';
import {
  ApproveStayBookingDto,
  CancelMyStayDto,
  CancelStayBookingDto,
  CheckInStayDto,
  CreateStayBookingDto,
  CreateStayDto,
  CreateStayOptionDto,
  CreateStayQuestionDto,
  ListStayBookingsQuery,
  RejectStayBookingDto,
  UpdateStayBookingDto,
  UpdateStayDto,
  UpdateStayOptionDto,
  UpdateStayQuestionDto,
  VerifyStayPaymentDto,
} from './dto';
import { StaysService } from './stays.service';
import { StayBookingsService } from './stay-bookings.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Unifesto Stay. Team routes live under /events/:eventId/… and are gated by
 * capability: setting stays up needs event:edit, handling bookings needs
 * event:manage-attendees, and the property desk (pass scan, payment at the
 * property, check-in/out) needs event:check-in. Attendee routes live under
 * /stays/… and act only on the caller's own bookings.
 */
@ApiTags('stays')
@ApiBearerAuth()
@Controller()
export class StaysController {
  constructor(
    private readonly stays: StaysService,
    private readonly bookings: StayBookingsService,
  ) {}

  // ───────────── Team: setup (event:edit) ─────────────

  @Get('events/:eventId/stays/manage')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  @ApiOperation({
    summary: 'All stays on the event with bed counts and booking tallies',
  })
  listForTeam(@Param('eventId', uuid) eventId: string) {
    return this.stays.listForTeam(eventId);
  }

  @Get('events/:eventId/stays/manage/:stayId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  getForTeam(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
  ) {
    return this.stays.getForTeam(eventId, stayId);
  }

  @Post('events/:eventId/stays')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  create(
    @Param('eventId', uuid) eventId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateStayDto,
  ) {
    return this.stays.create(eventId, user.id, dto);
  }

  @Patch('events/:eventId/stays/:stayId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  update(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Body() dto: UpdateStayDto,
  ) {
    return this.stays.update(eventId, stayId, dto);
  }

  @Delete('events/:eventId/stays/:stayId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  remove(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
  ) {
    return this.stays.remove(eventId, stayId);
  }

  @Post('events/:eventId/stays/:stayId/cover')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  @UseInterceptors(FileInterceptor('file', uploadLimit(10)))
  @ApiConsumes('multipart/form-data')
  uploadCover(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.stays.uploadCover(eventId, stayId, file);
  }

  @Post('events/:eventId/stays/:stayId/gallery')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  @UseInterceptors(FileInterceptor('file', uploadLimit(10)))
  @ApiConsumes('multipart/form-data')
  addGalleryPhoto(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.stays.addGalleryPhoto(eventId, stayId, file);
  }

  @Post('events/:eventId/stays/:stayId/gallery/remove')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  removeGalleryPhoto(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Body('url') url: string,
  ) {
    return this.stays.removeGalleryPhoto(eventId, stayId, String(url ?? ''));
  }

  @Post('events/:eventId/stays/:stayId/options')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  createOption(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Body() dto: CreateStayOptionDto,
  ) {
    return this.stays.createOption(eventId, stayId, dto);
  }

  @Patch('events/:eventId/stays/:stayId/options/:optionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  updateOption(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Param('optionId', uuid) optionId: string,
    @Body() dto: UpdateStayOptionDto,
  ) {
    return this.stays.updateOption(eventId, stayId, optionId, dto);
  }

  @Delete('events/:eventId/stays/:stayId/options/:optionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  removeOption(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Param('optionId', uuid) optionId: string,
  ) {
    return this.stays.removeOption(eventId, stayId, optionId);
  }

  @Post('events/:eventId/stays/:stayId/questions')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  createQuestion(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Body() dto: CreateStayQuestionDto,
  ) {
    return this.stays.createQuestion(eventId, stayId, dto);
  }

  @Patch('events/:eventId/stays/:stayId/questions/:questionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  updateQuestion(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Param('questionId', uuid) questionId: string,
    @Body() dto: UpdateStayQuestionDto,
  ) {
    return this.stays.updateQuestion(eventId, stayId, questionId, dto);
  }

  @Delete('events/:eventId/stays/:stayId/questions/:questionId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  removeQuestion(
    @Param('eventId', uuid) eventId: string,
    @Param('stayId', uuid) stayId: string,
    @Param('questionId', uuid) questionId: string,
  ) {
    return this.stays.removeQuestion(eventId, stayId, questionId);
  }

  // ───────────── Team: bookings (event:manage-attendees) ─────────────

  @Get('events/:eventId/stay-bookings')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  listBookings(
    @Param('eventId', uuid) eventId: string,
    @Query() q: ListStayBookingsQuery,
  ) {
    return this.bookings.listForEvent(eventId, q);
  }

  @Get('events/:eventId/stay-bookings/:bookingId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_CHECK_IN, { eventKey: 'eventId' })
  getBooking(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
  ) {
    return this.bookings.getForEvent(eventId, bookingId);
  }

  @Post('events/:eventId/stay-bookings/:bookingId/approve')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  approve(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
    @Body() dto: ApproveStayBookingDto,
  ) {
    return this.bookings.approve(eventId, bookingId, user.id, dto);
  }

  @Post('events/:eventId/stay-bookings/:bookingId/reject')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  reject(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
    @Body() dto: RejectStayBookingDto,
  ) {
    return this.bookings.reject(eventId, bookingId, user.id, dto.reason);
  }

  @Patch('events/:eventId/stay-bookings/:bookingId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  updateBooking(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
    @Body() dto: UpdateStayBookingDto,
  ) {
    return this.bookings.update(eventId, bookingId, dto);
  }

  @Post('events/:eventId/stay-bookings/:bookingId/cancel')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  cancelBooking(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
    @Body() dto: CancelStayBookingDto,
  ) {
    return this.bookings.cancel(eventId, bookingId, user.id, dto);
  }

  // ───────────── Team: property desk (event:check-in) ─────────────

  @Get('events/:eventId/stay-pass/:passCode')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_CHECK_IN, { eventKey: 'eventId' })
  @ApiOperation({ summary: 'Look up a scanned Stay Pass' })
  lookupPass(
    @Param('eventId', uuid) eventId: string,
    @Param('passCode') passCode: string,
  ) {
    return this.bookings.lookupPass(eventId, passCode);
  }

  // Recording money taken on its own is not a desk/scanner job: crew
  // (check-in only) can't mark a stay paid; curators and co-curators can.
  // Crew record pay-at-property money only as part of check-in (below).
  @Post('events/:eventId/stay-bookings/:bookingId/mark-paid')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  markPaid(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
  ) {
    return this.bookings.markPaid(eventId, bookingId);
  }

  @Post('events/:eventId/stay-bookings/:bookingId/check-in')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_CHECK_IN, { eventKey: 'eventId' })
  checkIn(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
    @Body() dto: CheckInStayDto,
  ) {
    return this.bookings.checkIn(eventId, bookingId, user.id, dto?.collected);
  }

  @Post('events/:eventId/stay-bookings/:bookingId/check-out')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_CHECK_IN, { eventKey: 'eventId' })
  checkOut(
    @Param('eventId', uuid) eventId: string,
    @Param('bookingId', uuid) bookingId: string,
  ) {
    return this.bookings.checkOut(eventId, bookingId);
  }

  // ───────────── Attendee ─────────────

  @Get('events/:eventId/stays')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Published stays for an event, with availability and my booking',
  })
  listForAttendee(
    @Param('eventId', uuid) eventId: string,
    @CurrentUser() user: User,
  ) {
    return this.stays.listForAttendee(eventId, user.id);
  }

  @Post('stays/:stayId/upload')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', uploadLimit(FILE_MAX_MB_CAP)))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a guest photo ID, or a FILE answer (?questionId=), privately',
  })
  upload(
    @Param('stayId', uuid) stayId: string,
    @Query('questionId') questionId: string | undefined,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.stays.upload(user.id, stayId, questionId || undefined, file);
  }

  @Post('stays/:stayId/bookings')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  request(
    @Param('stayId', uuid) stayId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateStayBookingDto,
  ) {
    return this.bookings.request(user.id, stayId, dto);
  }

  @Get('stays/bookings/mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: User, @Query('eventId') eventId?: string) {
    return this.bookings.listMine(user.id, eventId || undefined);
  }

  @Get('stays/bookings/:bookingId')
  @UseGuards(JwtAuthGuard)
  getMine(
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
  ) {
    return this.bookings.getMine(user.id, bookingId);
  }

  @Post('stays/bookings/:bookingId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelMine(
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
    @Body() dto: CancelMyStayDto,
  ) {
    return this.bookings.cancelMine(user.id, bookingId, dto.reason);
  }

  @Post('stays/bookings/:bookingId/pay')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  pay(@Param('bookingId', uuid) bookingId: string, @CurrentUser() user: User) {
    return this.bookings.createOrder(user.id, bookingId);
  }

  @Post('stays/bookings/:bookingId/verify')
  @UseGuards(JwtAuthGuard)
  verify(
    @Param('bookingId', uuid) bookingId: string,
    @CurrentUser() user: User,
    @Body() dto: VerifyStayPaymentDto,
  ) {
    return this.bookings.verify(user.id, bookingId, dto);
  }
}
