import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards, DefaultValuePipe } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CampaignCountDto, CreateCampaignDto, TestCampaignDto } from './dto/campaign.dto';

/** Apex: one campaign over push, in-app, email and WhatsApp (C17). */
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminCampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user.id, dto);
  }

  /** Who each chosen channel would reach now, after its opt-outs. */
  @Post('audience')
  count(@Body() dto: CampaignCountDto) {
    return this.campaigns.count(dto);
  }

  /** Each chosen channel to the signed-in admin only. */
  @Post('test')
  test(@CurrentUser() user: User, @Body() dto: TestCampaignDto) {
    return this.campaigns.sendTest(user.id, dto);
  }

  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.campaigns.list(page, limit);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel(id);
  }
}
