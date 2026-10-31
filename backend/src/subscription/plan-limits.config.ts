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
  /** Organiser platform fee % per paid ticket (A9). Ships at 0: an admin sets it to go live. */
  platformFeePercent: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

/** The boolean feature switches on a plan, in display order. */
export const PLAN_FEATURE_FLAGS = [
  'hasWaitlist',
  'hasBulkExport',
  'hasAnalytics',
  'hasCertificates',
  'hasWhatsappBlast',
  'hasRecurringEvents',
  'hasSessions',
  'hasSponsors',
  'hasLeaderboard',
  'hasRemoveBranding',
  'hasPrioritySupport',
] as const satisfies readonly (keyof PlanLimits)[];
export type PlanFeatureFlag = (typeof PLAN_FEATURE_FLAGS)[number];

/** What each switch is called to organisers (emails, plan pages). */
export const FEATURE_LABELS: Record<PlanFeatureFlag, string> = {
  hasWaitlist: 'Waiting list',
  hasBulkExport: 'Bulk export (CSV, Excel, PDF)',
  hasAnalytics: 'Analytics and event reports',
  hasCertificates: 'Certificates',
  hasWhatsappBlast: 'WhatsApp blasts',
  hasRecurringEvents: 'Recurring events',
  hasSessions: 'Huddle sessions',
  hasSponsors: 'Sponsors and lead capture',
  hasLeaderboard: 'Hackathon leaderboards',
  hasRemoveBranding: 'White-label branding',
  hasPrioritySupport: 'Priority support',
};

export type PlanLimitKey = 'spaces' | 'eventsPerMonth' | 'attendeesPerEvent' | 'ticketTypes' | 'coCurators';

/**
 * One line of the plan comparison: a feature switch (`flag`), a number that
 * differs by plan (`limit`), or neither (included on every plan).
 */
export type PlanCatalogRow =
  | { label: string; flag: PlanFeatureFlag }
  | { label: string; limit: PlanLimitKey }
  | { label: string };

/**
 * Everything an organiser gets, grouped, for every plan page (Apex Plans,
 * Space billing, /pricing). One source so the three can't disagree. Rows
 * without a flag or limit are on every plan.
 */
export const PLAN_CATALOG: { group: string; rows: PlanCatalogRow[] }[] = [
  {
    group: 'Events and tickets',
    rows: [
      { label: 'Events a month', limit: 'eventsPerMonth' },
      { label: 'Attendees per event', limit: 'attendeesPerEvent' },
      { label: 'Ticket types per event', limit: 'ticketTypes' },
      { label: 'Free RSVP and paid tickets (Razorpay)' },
      { label: 'Group and team tickets' },
      { label: 'Capacity, sale windows and hidden tickets' },
      { label: 'Custom registration questions and file uploads' },
      { label: 'Discount codes' },
      { label: 'Include the buyer fee in your price' },
      { label: 'Online events with joining links' },
      { label: 'Co-hosting, sub-events and event transfer' },
      { label: 'AI event drafts' },
      { label: 'Waiting list with pay-to-claim offers', flag: 'hasWaitlist' },
      { label: 'Recurring event series', flag: 'hasRecurringEvents' },
    ],
  },
  {
    group: 'Attendees and check-in',
    rows: [
      { label: 'Attendee list, manual add and CSV import' },
      { label: 'Group seats and ticket transfers' },
      { label: 'Badge and pass printing' },
      { label: 'QR, manual and group check-in at many points' },
      { label: 'Offline check-in and event-day view in the app' },
      { label: 'Unifesto Stay: rooms and bookings' },
      { label: 'Bulk export (CSV, Excel, PDF)', flag: 'hasBulkExport' },
    ],
  },
  {
    group: 'Engagement and messaging',
    rows: [
      { label: 'Email campaigns, templates and open tracking' },
      { label: 'Push announcements' },
      { label: 'WhatsApp confirmations and group links' },
      { label: 'Live polls, Q&A and quizzes with a projector screen' },
      { label: 'WhatsApp blasts', flag: 'hasWhatsappBlast' },
    ],
  },
  {
    group: 'Insights',
    rows: [
      { label: 'Event stats, page traffic and registration sources' },
      { label: 'Short links, QR codes, UTM and partner links' },
      { label: 'Analytics and PDF event reports', flag: 'hasAnalytics' },
    ],
  },
  {
    group: 'Programmes',
    rows: [
      { label: 'Certificates: design, issue and verify', flag: 'hasCertificates' },
      { label: 'Huddle live sessions, paid and recorded', flag: 'hasSessions' },
      { label: 'Sponsors, booth lead scans and leads', flag: 'hasSponsors' },
      { label: 'Hackathons: teams, judging and leaderboards', flag: 'hasLeaderboard' },
    ],
  },
  {
    group: 'Money',
    rows: [
      { label: 'Finance overview, transactions and payouts' },
      { label: 'Refund review' },
    ],
  },
  {
    group: 'Brand',
    rows: [
      { label: 'White-label: colours, logo, favicon, no "Powered by"', flag: 'hasRemoveBranding' },
      { label: 'Own email sender and web domain', flag: 'hasRemoveBranding' },
    ],
  },
  {
    group: 'Team and support',
    rows: [
      { label: 'Spaces, counting sub-spaces', limit: 'spaces' },
      { label: 'Co-curators per event', limit: 'coCurators' },
      { label: 'Roles and permissions for your team' },
      { label: 'Assist inbox with AI-drafted replies' },
      { label: 'Priority support', flag: 'hasPrioritySupport' },
    ],
  },
];

/** What organisers call each plan (STARTER is shown as General). */
export const PLAN_NAMES: Record<OrgPlan, string> = {
  STARTER: 'General',
  CLUB: 'Club',
  GROWTH: 'Growth',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

/** Who each plan is for, one line, for every plan page. */
export const PLAN_TAGLINES: Record<OrgPlan, string> = {
  STARTER: 'Clubs getting started',
  CLUB: 'Clubs running regular events',
  GROWTH: 'Fest teams, hackathons and communities',
  PRO: 'Big fests on their own brand',
  ENTERPRISE: 'Universities running many spaces',
};

/**
 * Compiled fallback for each plan, used only when its plan_configs row is
 * missing. The live values are the rows (Apex › Plans edits them). STARTER is
 * shown as "General".
 */
export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  [OrgPlan.STARTER]: {
    spaces: 1,
    eventsPerMonth: null,
    attendeesPerEvent: 300,
    ticketTypes: 3,
    coCurators: 2,
    hasWaitlist: true,
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
    platformFeePercent: 3,
    monthlyPrice: 0,
    annualPrice: 0,
  },
  [OrgPlan.CLUB]: {
    spaces: 1,
    eventsPerMonth: null,
    attendeesPerEvent: 1000,
    ticketTypes: null,
    coCurators: 5,
    hasWaitlist: true,
    hasBulkExport: true,
    hasAnalytics: true,
    hasWhatsappBlast: false,
    hasRecurringEvents: true,
    hasRemoveBranding: false,
    hasPrioritySupport: false,
    hasSessions: false,
    hasLeaderboard: false,
    hasCertificates: true,
    hasSponsors: false,
    platformFeePercent: 3.5,
    monthlyPrice: 0,
    annualPrice: 0,
  },
  [OrgPlan.GROWTH]: {
    spaces: 5,
    eventsPerMonth: null,
    attendeesPerEvent: 5000,
    ticketTypes: null,
    coCurators: 10,
    hasWaitlist: true,
    hasBulkExport: true,
    hasAnalytics: true,
    hasWhatsappBlast: true,
    hasRecurringEvents: true,
    hasRemoveBranding: false,
    hasPrioritySupport: true,
    hasSessions: true,
    hasLeaderboard: true,
    hasCertificates: true,
    hasSponsors: true,
    platformFeePercent: 4,
    monthlyPrice: 0,
    annualPrice: 0,
  },
  [OrgPlan.PRO]: {
    spaces: 10,
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
    platformFeePercent: 4.5,
    monthlyPrice: 0,
    annualPrice: 0,
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
    platformFeePercent: 0,
    monthlyPrice: null,
    annualPrice: null,
  },
};
