import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { BillingCycle, OrgPlan } from '@prisma/client';

/** Platform admin: negotiated terms for a space or one of its events (T4). Null = rate card. */
export class CreateDealDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;

  @IsOptional()
  @IsInt()
  @Min(0)
  planPricePaise?: number;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  buyerFeeBps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  organiserFeeBps?: number;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpgradeSubscriptionDto {
  @IsEnum(OrgPlan)
  plan: OrgPlan;

  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;
}

export class VerifyUpgradeDto {
  @IsString()
  orderId: string;

  @IsString()
  paymentId: string;

  @IsString()
  signature: string;
}

/** Platform admin: a plan payment made outside Razorpay. */
export class RecordOfflinePaymentDto {
  @IsEnum(OrgPlan)
  plan: OrgPlan;

  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class AdminUpdateSubscriptionDto {
  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/** Admin edit of a plan's definition. All fields optional; null = unlimited. */
export class UpdatePlanConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  spaces?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  eventsPerMonth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  attendeesPerEvent?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  ticketTypes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  coCurators?: number | null;

  @IsOptional() @IsBoolean() hasWaitlist?: boolean;
  @IsOptional() @IsBoolean() hasBulkExport?: boolean;
  @IsOptional() @IsBoolean() hasAnalytics?: boolean;
  @IsOptional() @IsBoolean() hasWhatsappBlast?: boolean;
  @IsOptional() @IsBoolean() hasRecurringEvents?: boolean;
  @IsOptional() @IsBoolean() hasRemoveBranding?: boolean;
  @IsOptional() @IsBoolean() hasPrioritySupport?: boolean;
  @IsOptional() @IsBoolean() hasSessions?: boolean;
  @IsOptional() @IsBoolean() hasLeaderboard?: boolean;
  @IsOptional() @IsBoolean() hasCertificates?: boolean;
  @IsOptional() @IsBoolean() hasSponsors?: boolean;
  // Not @IsOptional: that lets null through, and the column is NOT NULL (500).
  @ValidateIf((_, v) => v !== undefined)
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  annualPrice?: number | null;
}

export class SubscriptionResponseDto {
  id: string;

  plan: OrgPlan;

  billingCycle: BillingCycle;

  isActive: boolean;

  startedAt: Date;

  expiresAt?: Date;

  nextPaymentAt?: Date;

  eventsThisMonth: number;

  usageResetAt: Date;
}

export class SubscriptionUsageDto {
  spacesCount: number;

  eventsThisMonth: number;

  plan: OrgPlan;

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
   * (a lapsed plan gets Starter's flags).
   */
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
