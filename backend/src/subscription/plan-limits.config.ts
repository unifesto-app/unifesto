import { OrgPlan } from '@prisma/client';

export interface PlanLimits {
  spaces: number | null;
  eventsPerMonth: number | null;
  attendeesPerEvent: number | null;
  ticketTypes: number | null;
  coCurators: number | null;
  hasWaitlist: boolean;
  hasBulkExport: boolean;
  hasAnalytics: boolean;
  hasWhatsappBlast: boolean;
  hasRecurringEvents: boolean;
  hasRemoveBranding: boolean;
  hasPrioritySupport: boolean;
  /** Gates the Sessions feature entirely. */
  hasSessions: boolean;
  /** Gates the competitive dashboard (leaderboards) entirely. */
  hasLeaderboard: boolean;
  /** Gates the certificate system: designing templates and issuing certificates. */
  hasCertificates: boolean;
  /** Gates the sponsors & lead-generation feature (roster, leads, portal). */
  hasSponsors: boolean;
  processingFeePercent: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  [OrgPlan.STARTER]: {
    spaces: 1,
    eventsPerMonth: 2,
    attendeesPerEvent: 50,
    ticketTypes: 1,
    coCurators: 0,
    hasWaitlist: false,
    hasBulkExport: false,
    hasAnalytics: false,
    hasWhatsappBlast: false,
    hasRecurringEvents: false,
    hasRemoveBranding: false,
    hasPrioritySupport: false,
    hasSessions: false,
    hasLeaderboard: false,
    hasCertificates: false,
    hasSponsors: false,
    processingFeePercent: 5,
    monthlyPrice: 0,
    annualPrice: 0,
  },
  [OrgPlan.GROWTH]: {
    spaces: 2,
    eventsPerMonth: 10,
    attendeesPerEvent: 200,
    ticketTypes: 3,
    coCurators: 1,
    hasWaitlist: true,
    hasBulkExport: true,
    hasAnalytics: false,
    hasWhatsappBlast: false,
    hasRecurringEvents: false,
    hasRemoveBranding: false,
    hasPrioritySupport: false,
    hasSessions: false,
    hasLeaderboard: false,
    hasCertificates: false,
    hasSponsors: false,
    processingFeePercent: 5,
    monthlyPrice: 499,
    annualPrice: 4499,
  },
  [OrgPlan.PRO]: {
    spaces: 5,
    eventsPerMonth: null,
    attendeesPerEvent: 1000,
    ticketTypes: null,
    coCurators: 3,
    hasWaitlist: true,
    hasBulkExport: true,
    hasAnalytics: true,
    hasWhatsappBlast: true,
    hasRecurringEvents: true,
    hasRemoveBranding: true,
    hasPrioritySupport: true,
    hasSessions: true,
    hasLeaderboard: true,
    hasCertificates: true,
    hasSponsors: true,
    processingFeePercent: 5,
    monthlyPrice: 1499,
    annualPrice: 13999,
  },
  [OrgPlan.ENTERPRISE]: {
    spaces: null,
    eventsPerMonth: null,
    attendeesPerEvent: null,
    ticketTypes: null,
    coCurators: null,
    hasWaitlist: true,
    hasBulkExport: true,
    hasAnalytics: true,
    hasWhatsappBlast: true,
    hasRecurringEvents: true,
    hasRemoveBranding: true,
    hasPrioritySupport: true,
    hasSessions: true,
    hasLeaderboard: true,
    hasCertificates: true,
    hasSponsors: true,
    processingFeePercent: 5,
    monthlyPrice: null,
    annualPrice: null,
  },
};
