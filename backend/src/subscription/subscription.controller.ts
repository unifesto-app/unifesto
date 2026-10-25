import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { TermsService } from './terms.service';
import {
  AdminUpdateSubscriptionDto,
  CreateDealDto,
  RecordOfflinePaymentDto,
  SubscriptionResponseDto,
  SubscriptionUsageDto,
  UpdateBillingModelConfigDto,
  UpdatePlanConfigDto,
  UpgradeSubscriptionDto,
  VerifyUpgradeDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Action, Can, CanGuard } from '../auth/authorization';
import { RoleCode, BillingModel, OrgPlan } from '@prisma/client';
import { toPage, toLimit } from '../common/pagination';

@ApiTags('Subscription')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CanGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly terms: TermsService,
  ) {}

  // ---- Space-scoped billing (P0.2) — the Space is the billing subject ----
  // Gated by can(space:manage-billing); CanGuard reads :spaceId from the route.

  @Get('space/:spaceId')
  @Can(Action.SPACE_MANAGE_BILLING)
  @ApiOperation({ summary: "Get a space's subscription details" })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async getSpaceSubscription(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.getSpaceSubscription(spaceId);
  }

  @Get('space/:spaceId/usage')
  @Can(Action.SPACE_MANAGE_BILLING)
  @ApiOperation({ summary: "Get a space's subscription usage stats" })
  @ApiResponse({ status: 200, type: SubscriptionUsageDto })
  async getSpaceUsage(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.getSpaceUsage(spaceId);
  }

  @Post('space/:spaceId/upgrade')
  @Can(Action.SPACE_MANAGE_BILLING)
  @ApiOperation({ summary: "Create Razorpay order to upgrade a space's plan" })
  @ApiResponse({ status: 201 })
  async createSpaceUpgradeOrder(
    @Param('spaceId') spaceId: string,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return this.subscriptionService.createUpgradeOrderForSpace(spaceId, dto);
  }

  @Post('space/:spaceId/upgrade/verify')
  @Can(Action.SPACE_MANAGE_BILLING)
  @ApiOperation({ summary: "Verify payment and activate a space's plan" })
  @ApiResponse({ status: 200 })
  async verifySpaceUpgrade(
    @Param('spaceId') spaceId: string,
    @Body() dto: VerifyUpgradeDto,
  ) {
    return this.subscriptionService.verifyAndActivateForSpace(spaceId, dto);
  }

  @Post('space/:spaceId/cancel')
  @Can(Action.SPACE_MANAGE_BILLING)
  @ApiOperation({ summary: "Cancel a space's plan (downgrade to STARTER)" })
  @ApiResponse({ status: 200 })
  async cancelSpaceSubscription(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.cancelSubscriptionForSpace(spaceId);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get all available plans with pricing' })
  @ApiResponse({ status: 200 })
  async getAllPlans() {
    return this.subscriptionService.getAllPlans();
  }

  // ---- Space-driven admin billing (P2.1) — the Space is the billing subject ----

  @Get('admin/spaces')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Get every space with its billing arrangement (admin only)' })
  @ApiResponse({ status: 200 })
  async getAllSpaceSubscriptions(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('billingModel') billingModel?: BillingModel,
    @Query('plan') plan?: OrgPlan,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.subscriptionService.getAllSpaceSubscriptions(toPage(page), toLimit(limit), {
      billingModel,
      plan,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      search,
    });
  }

  @Get('admin/spaces/stats')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Space-driven billing overview counts (admin only)' })
  @ApiResponse({ status: 200 })
  async getSpaceBillingStats() {
    return this.subscriptionService.getSpaceBillingStats();
  }

  @Patch('admin/plans/:plan')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: "Edit a plan's definition (admin only)" })
  @ApiResponse({ status: 200 })
  async updatePlanConfig(
    @Param('plan') plan: OrgPlan,
    @Body() dto: UpdatePlanConfigDto,
  ) {
    return this.subscriptionService.updatePlanConfig(plan, dto);
  }

  @Get('models')
  @ApiOperation({ summary: 'Billing-model definitions (Free, Revenue-share)' })
  @ApiResponse({ status: 200 })
  async getBillingModels() {
    return this.subscriptionService.getBillingModels();
  }

  @Patch('admin/models/:model')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Edit a Free / Revenue-share definition (admin)' })
  @ApiResponse({ status: 200 })
  async updateBillingModel(
    @Param('model') model: BillingModel,
    @Body() dto: UpdateBillingModelConfigDto,
  ) {
    return this.subscriptionService.updateBillingModel(model, dto);
  }

  @Patch('admin/space/:spaceId')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: "Manually update a space's subscription (admin only)" })
  @ApiResponse({ status: 200 })
  async adminUpdateSpaceSubscription(
    @Param('spaceId') spaceId: string,
    @Body() dto: AdminUpdateSubscriptionDto,
  ) {
    return this.subscriptionService.adminUpdateSubscriptionForSpace(spaceId, dto);
  }

  @Post('admin/space/:spaceId/offline-payment')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: "Record an offline payment for a space's plan (admin only)" })
  @ApiResponse({ status: 201 })
  async recordOfflinePayment(
    @Param('spaceId') spaceId: string,
    @Body() dto: RecordOfflinePaymentDto,
  ) {
    return this.subscriptionService.recordOfflinePaymentForSpace(spaceId, dto);
  }

  @Get('admin/space/:spaceId/plan-prices')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'What each paid plan and cycle costs a space now, deal or rate card (admin only)' })
  async getPlanPrices(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.getPlanPricesForSpace(spaceId);
  }

  // ---- Deals (T4): negotiated terms per space or event ----

  @Get('admin/space/:spaceId/deals')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: "A space's deals, newest first, plus the terms in force (admin only)" })
  async listDeals(@Param('spaceId') spaceId: string) {
    const [deals, current] = await Promise.all([
      this.terms.listDeals(spaceId),
      this.terms.resolve(spaceId),
    ]);
    return { deals, current };
  }

  @Post('admin/space/:spaceId/deals')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Create a deal for a space or one of its events (admin only)' })
  async createDeal(@Request() req, @Param('spaceId') spaceId: string, @Body() dto: CreateDealDto) {
    return this.terms.createDeal(spaceId, dto, req.user.id);
  }

  @Post('admin/deals/:dealId/end')
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'End a deal now (admin only); it is kept for the sales it priced' })
  async endDeal(@Param('dealId') dealId: string) {
    return this.terms.endDeal(dealId);
  }
}
