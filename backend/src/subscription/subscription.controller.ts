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
import {
  AdminUpdateSubscriptionDto,
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

@ApiTags('Subscription')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CanGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

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
    return this.subscriptionService.getAllSpaceSubscriptions(+page, +limit, {
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
}
