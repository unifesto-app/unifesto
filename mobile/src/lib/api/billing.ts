import { call } from './manageEvent';

/*
 * A space's plan and usage (space:manage-billing, Space Admins). Mobile reads
 * the plan, usage and catalogue and can cancel; paid plan changes stay on the
 * web (see BillingScreen for why).
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

export interface PlanInfo {
  plan: OrgPlan;
  eventsPerMonth: number | null;
  attendeesPerEvent: number | null;
  hasWaitlist: boolean;
  hasAnalytics: boolean;
  hasSessions: boolean;
  hasCertificates: boolean;
  hasLeaderboard: boolean;
  hasRemoveBranding: boolean;
  hasPrioritySupport: boolean;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

export interface Usage {
  spacesCount: number;
  eventsThisMonth: number;
  limits: { spaces: number | null; eventsPerMonth: number | null; attendeesPerEvent: number | null };
  features: { hasBulkExport: boolean; hasRemoveBranding: boolean } & Record<string, boolean>;
}

export const getSubscription = (spaceId: string) => call<Subscription>(`/subscription/space/${spaceId}`);
export const getUsage = (spaceId: string) => call<Usage>(`/subscription/space/${spaceId}/usage`);
export const getPlans = () => call<PlanInfo[]>('/subscription/plans');
export const cancelSubscription = (spaceId: string) =>
  call<unknown>(`/subscription/space/${spaceId}/cancel`, { method: 'POST' });

export const PLAN_LABEL: Record<OrgPlan, string> = { STARTER: 'Starter', GROWTH: 'Growth', PRO: 'Pro', ENTERPRISE: 'Enterprise' };
export const PLAN_ORDER: OrgPlan[] = ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];

export const PLAN_FEATURES: { key: keyof PlanInfo; label: string }[] = [
  { key: 'hasWaitlist', label: 'Waiting lists' },
  { key: 'hasAnalytics', label: 'Analytics and reports' },
  { key: 'hasSessions', label: 'Sessions' },
  { key: 'hasCertificates', label: 'Certificates' },
  { key: 'hasLeaderboard', label: 'Leaderboards' },
  { key: 'hasRemoveBranding', label: 'Own accent colour' },
  { key: 'hasPrioritySupport', label: 'Priority support' },
];

export const limitLabel = (n: number | null | undefined) => (n == null ? 'Unlimited' : n.toLocaleString('en-IN'));

/** One-line description of how the space is billed. */
export function billingSummary(s: Subscription): string {
  if (s.configured === false || !s.billingModel) return 'No arrangement set';
  switch (s.billingModel) {
    case 'FREE':
      return 'Free, no platform fee';
    case 'REVENUE_SHARE':
      return `${Number(s.revenueSharePercent ?? 0)}% of event sales`;
    case 'SUBSCRIPTION': {
      const amt = Number(s.amount) || 0;
      const label = s.plan ? PLAN_LABEL[s.plan] : 'Custom';
      return amt > 0 ? `${label} · ₹${amt.toLocaleString('en-IN')}/${s.billingCycle === 'ANNUAL' ? 'yr' : 'mo'}` : label;
    }
    default:
      return '';
  }
}
