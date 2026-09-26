import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BillingCycle, BillingModel, OrgPlan } from '@prisma/client';

export class UpgradeSubscriptionDto {
  @ApiProperty({ enum: OrgPlan, example: OrgPlan.GROWTH })
  @IsEnum(OrgPlan)
  plan: OrgPlan;

  @ApiProperty({ enum: BillingCycle, example: BillingCycle.MONTHLY })
  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;
}

export class VerifyUpgradeDto {
  @ApiProperty({ example: 'order_abc123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 'pay_xyz789' })
  @IsString()
  paymentId: string;

  @ApiProperty({ example: 'signature_hash' })
  @IsString()
  signature: string;
}

export class AdminUpdateSubscriptionDto {
  @ApiPropertyOptional({
    enum: BillingModel,
    description: 'How the organiser is billed',
  })
  @IsOptional()
  @IsEnum(BillingModel)
  billingModel?: BillingModel;

  @ApiPropertyOptional({
    example: 8,
    description: 'Platform cut (%) when billingModel is REVENUE_SHARE',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  revenueSharePercent?: number;

  @ApiPropertyOptional({ enum: OrgPlan })
  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({
    example: 499,
    description: 'Recurring amount for a custom SUBSCRIPTION arrangement',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'Moved to revenue-share arrangement' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Admin edit of a plan's definition. All fields optional; null = unlimited. */
export class UpdatePlanConfigDto {
  @ApiPropertyOptional({ description: 'Max spaces; null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  spaces?: number | null;

  @ApiPropertyOptional({ description: 'Events per month; null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  eventsPerMonth?: number | null;

  @ApiPropertyOptional({ description: 'Attendees per event; null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  attendeesPerEvent?: number | null;

  @ApiPropertyOptional({ description: 'Ticket types; null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ticketTypes?: number | null;

  @ApiPropertyOptional({ description: 'Co-organisers; null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  coCurators?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasWaitlist?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasBulkExport?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasAnalytics?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasWhatsappBlast?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasRecurringEvents?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasRemoveBranding?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasPrioritySupport?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasSessions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasLeaderboard?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasCertificates?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasSponsors?: boolean;
  @ApiPropertyOptional({ example: 5, description: 'Processing fee (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  processingFeePercent?: number;

  @ApiPropertyOptional({ description: 'Monthly price (₹); null = custom' })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number | null;

  @ApiPropertyOptional({ description: 'Annual price (₹); null = custom' })
  @IsOptional()
  @IsInt()
  @Min(0)
  annualPrice?: number | null;
}

/** Admin edit of a Free / Revenue-share model definition. */
export class UpdateBillingModelConfigDto {
  @ApiPropertyOptional({ description: 'Default % for REVENUE_SHARE' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultRevenueSharePercent?: number | null;

  @ApiPropertyOptional({ description: 'Max spaces; null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  spaces?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) eventsPerMonth?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) attendeesPerEvent?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) ticketTypes?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) coCurators?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasWaitlist?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasBulkExport?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasAnalytics?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasWhatsappBlast?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasRecurringEvents?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasRemoveBranding?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasPrioritySupport?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasSessions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasLeaderboard?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasCertificates?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasSponsors?: boolean;
}

export class SubscriptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: BillingModel })
  billingModel: BillingModel;

  @ApiPropertyOptional({ description: 'Platform cut (%) for REVENUE_SHARE' })
  revenueSharePercent?: number | null;

  @ApiProperty({ enum: OrgPlan })
  plan: OrgPlan;

  @ApiProperty({ enum: BillingCycle })
  billingCycle: BillingCycle;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiPropertyOptional()
  nextPaymentAt?: Date;

  @ApiProperty()
  eventsThisMonth: number;

  @ApiProperty()
  usageResetAt: Date;
}

export class SubscriptionUsageDto {
  @ApiProperty()
  spacesCount: number;

  @ApiProperty()
  eventsThisMonth: number;

  @ApiProperty()
  plan: OrgPlan;

  @ApiProperty()
  limits: {
    spaces: number | null;
    eventsPerMonth: number | null;
    attendeesPerEvent: number | null;
    ticketTypes: number | null;
    coCurators: number | null;
  };

  /**
   * The effective feature flags for this space, derived from the SAME
   * `getEffectiveLimits` call the backend enforces with. UIs gate on these so a
   * disabled/upsell control can never disagree with the endpoint's own check
   * (which matters for FREE / REVENUE_SHARE spaces, whose flags come from the
   * billing-model config rather than the plan table).
   */
  @ApiProperty()
  features: {
    hasWaitlist: boolean;
    hasBulkExport: boolean;
    hasAnalytics: boolean;
    hasWhatsappBlast: boolean;
    hasRecurringEvents: boolean;
    hasRemoveBranding: boolean;
    hasPrioritySupport: boolean;
    hasSessions: boolean;
    hasLeaderboard: boolean;
    hasCertificates: boolean;
    hasSponsors: boolean;
  };
}
