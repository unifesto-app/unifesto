import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailTemplatesService } from './email-templates.service';
import {
  CampaignAudienceDto,
  CreateCampaignDto,
  PreviewCampaignDto,
  TestCampaignDto,
} from './dto/campaign.dto';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { toPage, toLimit } from '../common/pagination';

/**
 * Space-scoped email: campaigns to a space's own audiences and a per-space
 * template library. Every route is gated by `space:manage-email` on the
 * `:spaceId` in the path (Space Admin + Curator hold it; a Platform Admin also
 * passes via the inheritance superuser rule). The service constrains recipient
 * resolution to the same space, so the guard and the data path agree.
 */
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('spaces/:spaceId/email')
export class SpaceEmailController {
  constructor(
    private readonly campaigns: EmailCampaignsService,
    private readonly templates: EmailTemplatesService,
  ) {}

  // --- Campaigns -----------------------------------------------------------

  @Post('campaigns')
  @Can(Action.SPACE_MANAGE_EMAIL)
  createCampaign(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaigns.createCampaign({ spaceId }, user.id, dto);
  }

  @Get('campaigns')
  @Can(Action.SPACE_MANAGE_EMAIL)
  listCampaigns(
    @Param('spaceId') spaceId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.campaigns.listCampaigns(
      { spaceId },
      toPage(page),
      toLimit(limit),
      search,
    );
  }

  @Get('campaigns/:id')
  @Can(Action.SPACE_MANAGE_EMAIL)
  getCampaign(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.getCampaign({ spaceId }, id);
  }

  @Post('campaigns/:id/cancel')
  @Can(Action.SPACE_MANAGE_EMAIL)
  cancelCampaign(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.cancelCampaign({ spaceId }, id);
  }

  @Post('audience')
  @Can(Action.SPACE_MANAGE_EMAIL)
  audience(@Param('spaceId') spaceId: string, @Body() dto: CampaignAudienceDto) {
    return this.campaigns.countAudience({ spaceId }, dto);
  }

  @Post('test')
  @Can(Action.SPACE_MANAGE_EMAIL)
  sendTest(@CurrentUser() user: User, @Body() dto: TestCampaignDto) {
    return this.campaigns.sendTest(user.id, dto);
  }

  @Post('preview')
  @Can(Action.SPACE_MANAGE_EMAIL)
  preview(@Body() dto: PreviewCampaignDto) {
    return { html: this.campaigns.renderPreview(dto.body) };
  }

  // --- Templates (space-owned + GLOBAL read-only) --------------------------

  @Get('templates')
  @Can(Action.SPACE_MANAGE_EMAIL)
  listTemplates(@Param('spaceId') spaceId: string) {
    return this.templates.listForSpace(spaceId);
  }

  @Get('templates/:id')
  @Can(Action.SPACE_MANAGE_EMAIL)
  getTemplate(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
  ) {
    return this.templates.getForSpace(id, spaceId);
  }

  @Post('templates')
  @Can(Action.SPACE_MANAGE_EMAIL)
  createTemplate(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.createForSpace(spaceId, user.id, dto);
  }

  @Patch('templates/:id')
  @Can(Action.SPACE_MANAGE_EMAIL)
  updateTemplate(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.updateForSpace(id, spaceId, dto);
  }

  @Delete('templates/:id')
  @Can(Action.SPACE_MANAGE_EMAIL)
  deleteTemplate(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
  ) {
    return this.templates.deleteForSpace(id, spaceId);
  }
}
