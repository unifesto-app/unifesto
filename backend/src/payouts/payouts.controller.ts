import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { AddBankAccountDto, CreateEventPayoutDto, CreatePayoutDto, MarkPayoutPaidDto, RequestPayoutDto, UpdateBankAccountStatusDto, SetEventPayoutAccountDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

@ApiTags('Payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('bank-accounts')
  async addBankAccount(@Request() req, @Body() dto: AddBankAccountDto) {
    return this.payoutsService.addBankAccount(req.user.id, dto);
  }

  @Get('bank-accounts')
  async getMyBankAccounts(@Request() req) {
    return this.payoutsService.getMyBankAccounts(req.user.id);
  }

  @Delete('bank-accounts/:id')
  async deleteBankAccount(@Request() req, @Param('id') id: string) {
    return this.payoutsService.deleteBankAccount(req.user.id, id);
  }

  @Get('my')
  async getMyPayouts(@Request() req, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.payoutsService.getPayoutsForOrganiser(req.user.id, +page, +limit);
  }

  @Get('event/:eventId/summary')
  async getEventPayoutSummary(@Request() req, @Param('eventId') eventId: string) {
    return this.payoutsService.getEventPayoutSummary(eventId, req.user.id);
  }

  /** Every payout for a space's events (space admins only, not just own). */
  @Get('space/:spaceId')
  async getSpacePayouts(@Request() req, @Param('spaceId') spaceId: string) {
    return this.payoutsService.getSpacePayouts(req.user.id, spaceId);
  }

  /** Cash-accurate financials roll-up for one space (space admins only). */
  @Get('space/:spaceId/financials')
  async getSpaceFinancials(@Request() req, @Param('spaceId') spaceId: string) {
    return this.payoutsService.getSpaceFinancials(req.user.id, spaceId);
  }

  /** Accounts this event's payout may be routed to (own + other Space Admins'). */
  @Get('event/:eventId/eligible-accounts')
  async getEligibleAccounts(@Request() req, @Param('eventId') eventId: string) {
    return this.payoutsService.getEligibleAccountsForEvent(eventId, req.user.id);
  }

  /** Set (or clear, with bankAccountId: null) the event's default payout account. */
  @Patch('event/:eventId/payout-account')
  async setEventPayoutAccount(
    @Request() req,
    @Param('eventId') eventId: string,
    @Body() dto: SetEventPayoutAccountDto,
  ) {
    return this.payoutsService.setEventPayoutAccount(
      req.user.id,
      eventId,
      dto.bankAccountId ?? null,
    );
  }

  @Post('request')
  async requestPayout(
    @Request() req,
    @Body() body: RequestPayoutDto,
  ) {
    return this.payoutsService.requestPayout(
      req.user.id,
      body.eventId,
      body.amount,
      body.bankAccountId ?? null,
    );
  }

  @Get('admin/bank-accounts')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllBankAccounts(@Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: string) {
    return this.payoutsService.getAllBankAccounts(+page, +limit, status);
  }

  @Patch('admin/bank-accounts/:id/status')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async updateBankAccountStatus(@Request() req, @Param('id') id: string, @Body() dto: UpdateBankAccountStatusDto) {
    return this.payoutsService.updateBankAccountStatus(id, dto, req.user.id);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllPayouts(@Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: string) {
    return this.payoutsService.getAllPayouts(+page, +limit, status);
  }

  /** Platform-wide financials roll-up across every space (platform admin). */
  @Get('admin/financials')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getPlatformFinancials() {
    return this.payoutsService.getPlatformFinancials();
  }

  /** Per-space and per-event breakdown behind the platform Financials page. */
  @Get('admin/financials/breakdown')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getPlatformFinancialsBreakdown() {
    return this.payoutsService.getPlatformFinancialsBreakdown();
  }

  @Get('admin/event/:eventId/summary')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAdminEventPayoutSummary(@Param('eventId') eventId: string) {
    return this.payoutsService.getEventPayoutSummary(eventId);
  }

  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async createPayout(@Request() req, @Body() dto: CreatePayoutDto) {
    return this.payoutsService.createPayout(dto, req.user.id);
  }

  @Post('admin/create-for-event')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async createForEvent(
    @Request() req,
    @Body() body: CreateEventPayoutDto,
  ) {
    return this.payoutsService.createEventPayout(
      body.eventId,
      req.user.id,
      body.amount,
    );
  }

  @Post('admin/:id/process')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async processPayout(@Request() req, @Param('id') id: string, @Body() dto: MarkPayoutPaidDto) {
    return this.payoutsService.markPayoutPaid(id, dto, req.user.id);
  }

  @Patch('admin/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async cancelPayout(@Request() req, @Param('id') id: string) {
    return this.payoutsService.cancelPayout(id, req.user.id);
  }
}
