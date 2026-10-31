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
import { SubscriptionService } from './subscription.service';
import { TermsService } from './terms.service';
import {
  AdminUpdateSubscriptionDto,
  CreateDealDto,
  RecordOfflinePaymentDto,
  SubscriptionResponseDto,
  SubscriptionUsageDto,
  UpdatePlanConfigDto,
  UpgradeSubscriptionDto,
  VerifyUpgradeDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Action, Can, CanGuard } from '../auth/authorization';
import { RoleCode, OrgPlan } from '@prisma/client';
import { toPage, toLimit } from '../common/pagination';
import { Audit } from '../audit/audit';

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
  async getSpaceSubscription(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.getSpaceSubscription(spaceId);
  }

  @Get('space/:spaceId/usage')
  @Can(Action.SPACE_MANAGE_BILLING)
  async getSpaceUsage(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.getSpaceUsage(spaceId);
  }

  @Post('space/:spaceId/upgrade')
  @Can(Action.SPACE_MANAGE_BILLING)
  async createSpaceUpgradeOrder(
    @Param('spaceId') spaceId: string,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return this.subscriptionService.createUpgradeOrderForSpace(spaceId, dto);
  }

  @Post('space/:spaceId/upgrade/verify')
  @Can(Action.SPACE_MANAGE_BILLING)
  async verifySpaceUpgrade(
    @Param('spaceId') spaceId: string,
    @Body() dto: VerifyUpgradeDto,
  ) {
    return this.subscriptionService.verifyAndActivateForSpace(spaceId, dto);
  }

  @Post('space/:spaceId/cancel')
  @Can(Action.SPACE_MANAGE_BILLING)
  async cancelSpaceSubscription(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.cancelSubscriptionForSpace(spaceId);
  }

  @Get('plans')
  async getAllPlans() {
    return this.subscriptionService.getAllPlans();
  }

  // ---- Space-driven admin billing (P2.1) — the Space is the billing subject ----

  @Get('admin/spaces')
  @Roles(RoleCode.ADMIN)
  async getAllSpaceSubscriptions(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('plan') plan?: OrgPlan,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.subscriptionService.getAllSpaceSubscriptions(toPage(page), toLimit(limit), {
      plan,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      search,
    });
  }

  @Get('admin/spaces/stats')
  @Roles(RoleCode.ADMIN)
  async getSpaceBillingStats() {
    return this.subscriptionService.getSpaceBillingStats();
  }

  @Patch('admin/plans/:plan')
  @Audit('plan.definition')
  @Roles(RoleCode.ADMIN)
  async updatePlanConfig(
    @Param('plan') plan: OrgPlan,
    @Body() dto: UpdatePlanConfigDto,
  ) {
    return this.subscriptionService.updatePlanConfig(plan, dto);
  }

  @Patch('admin/space/:spaceId')
  @Audit('space.plan', (r) => ({ spaceId: r.params.spaceId }))
  @Roles(RoleCode.ADMIN)
  async adminUpdateSpaceSubscription(
    @Param('spaceId') spaceId: string,
    @Body() dto: AdminUpdateSubscriptionDto,
  ) {
    return this.subscriptionService.adminUpdateSubscriptionForSpace(spaceId, dto);
  }

  @Post('admin/space/:spaceId/offline-payment')
  @Audit('space.plan.payment', (r) => ({ spaceId: r.params.spaceId }))
  @Roles(RoleCode.ADMIN)
  async recordOfflinePayment(
    @Param('spaceId') spaceId: string,
    @Body() dto: RecordOfflinePaymentDto,
  ) {
    return this.subscriptionService.recordOfflinePaymentForSpace(spaceId, dto);
  }

  @Get('admin/space/:spaceId/plan-prices')
  @Roles(RoleCode.ADMIN)
  async getPlanPrices(@Param('spaceId') spaceId: string) {
    return this.subscriptionService.getPlanPricesForSpace(spaceId);
  }

  // ---- Deals (T4): negotiated terms per space or event ----

  @Get('admin/space/:spaceId/deals')
  @Roles(RoleCode.ADMIN)
  async listDeals(@Param('spaceId') spaceId: string) {
    const [deals, current] = await Promise.all([
      this.terms.listDeals(spaceId),
      this.terms.resolve(spaceId),
    ]);
    return { deals, current };
  }

  @Post('admin/space/:spaceId/deals')
  @Audit('space.deal', (r) => ({ spaceId: r.params.spaceId }))
  @Roles(RoleCode.ADMIN)
  async createDeal(@Request() req, @Param('spaceId') spaceId: string, @Body() dto: CreateDealDto) {
    return this.terms.createDeal(spaceId, dto, req.user.id);
  }

  @Post('admin/deals/:dealId/end')
  @Audit('space.deal.end', (r, prisma) => prisma.deal.findUnique({ where: { id: r.params.dealId }, select: { spaceId: true } }).then((x) => x ?? {}))
  @Roles(RoleCode.ADMIN)
  async endDeal(@Param('dealId') dealId: string) {
    return this.terms.endDeal(dealId);
  }
}
