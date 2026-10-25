import { call } from './manageEvent';

/*
 * A space's plan and usage (space:manage-billing, Space Admins). Mobile reads
 * the plan name and usage and can cancel; no prices or catalogue (see
 * BillingScreen for why).
 */

export type OrgPlan = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';
export type BillingModel = 'FREE' | 'REVENUE_SHARE' | 'SUBSCRIPTION';

export interface Subscription {
  configured?: boolean;
  billingModel: BillingModel | null;
  revenueSharePercent: string | number | null;
  plan: OrgPlan | null;
  billingCycle: BillingCycle;
  amount: string | number;
  isActive: boolean;
  expiresAt: string | null;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
}

export interface Usage {
  spacesCount: number;
  eventsThisMonth: number;
  limits: { spaces: number | null; eventsPerMonth: number | null; attendeesPerEvent: number | null };
  features: { hasBulkExport: boolean; hasRemoveBranding: boolean } & Record<string, boolean>;
}
export const getUsage = (spaceId: string) => call<Usage>(`/subscription/space/${spaceId}/usage`);

export const PLAN_LABEL: Record<OrgPlan, string> = { STARTER: 'Starter', GROWTH: 'Growth', PRO: 'Pro', ENTERPRISE: 'Enterprise' };
