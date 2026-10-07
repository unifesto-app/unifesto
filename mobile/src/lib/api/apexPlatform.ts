import { call, type Result } from './manageEvent';
import { uploadImage } from './upload';

/*
 * Apex tools that were web-only: plans & billing models, per-space
 * subscriptions, Huddle sessions, API logs, blog and careers. Same endpoints
 * as websites/apex/lib/api/*; shapes trimmed to what the mobile screens show.
 */

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// ── Plans & billing models ───────────────────────────────────────────────────

export type OrgPlan = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
export type BillingModel = 'FREE' | 'REVENUE_SHARE' | 'SUBSCRIPTION';

/** Numeric limits; null = unlimited. */
export const PLAN_LIMITS = [
  ['spaces', 'Spaces'],
  ['eventsPerMonth', 'Events a month'],
  ['attendeesPerEvent', 'Attendees an event'],
  ['ticketTypes', 'Ticket types'],
  ['coCurators', 'Co-curators'],
] as const;

/** Feature switches, in the order the web shows them. */
export const PLAN_FEATURES = [
  ['hasSessions', 'Sessions (Huddle)'],
  ['hasCertificates', 'Certificates'],
  ['hasSponsors', 'Sponsors & leads'],
  ['hasLeaderboard', 'Leaderboard'],
  ['hasAnalytics', 'Analytics'],
  ['hasWaitlist', 'Waiting list'],
  ['hasBulkExport', 'Bulk export'],
  ['hasWhatsappBlast', 'WhatsApp blast'],
  ['hasRecurringEvents', 'Recurring events'],
  ['hasRemoveBranding', 'Remove branding'],
  ['hasPrioritySupport', 'Priority support'],
] as const;

export type LimitKey = (typeof PLAN_LIMITS)[number][0];
export type FeatureKey = (typeof PLAN_FEATURES)[number][0];

export type PlanCaps = Record<LimitKey, number | null> & Record<FeatureKey, boolean>;

export interface PlanInfo extends PlanCaps {
  plan: OrgPlan;
  processingFeePercent: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

export interface BillingModelConfig extends PlanCaps {
  billingModel: 'FREE' | 'REVENUE_SHARE';
  defaultRevenueSharePercent: number | null;
}

/** GET /subscription/plans */
export const getPlans = () => call<PlanInfo[]>('/subscription/plans');
/** GET /subscription/models — Free & Revenue-share. */
export const getBillingModels = () => call<BillingModelConfig[]>('/subscription/models');
/** PATCH /subscription/admin/plans/:plan */
export const updatePlan = (plan: OrgPlan, patch: Partial<Omit<PlanInfo, 'plan'>>) =>
  call<PlanInfo>(`/subscription/admin/plans/${plan}`, json('PATCH', patch));
/** PATCH /subscription/admin/models/:model */
export const updateBillingModel = (model: 'FREE' | 'REVENUE_SHARE', patch: Partial<Omit<BillingModelConfig, 'billingModel'>>) =>
  call<BillingModelConfig>(`/subscription/admin/models/${model}`, json('PATCH', patch));

export const PLAN_LABEL: Record<OrgPlan, string> = { STARTER: 'Starter', GROWTH: 'Growth', PRO: 'Pro', ENTERPRISE: 'Enterprise' };
export const MODEL_LABEL: Record<BillingModel, string> = { FREE: 'Free', REVENUE_SHARE: 'Revenue share', SUBSCRIPTION: 'Subscription' };

// ── Space subscriptions ──────────────────────────────────────────────────────

export interface SpaceSubscription {
  id: string | null;
  spaceId: string;
  configured?: boolean;
  billingModel: BillingModel | null;
  revenueSharePercent: string | number | null;
  plan: OrgPlan | null;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  amount: string | number;
  isActive: boolean;
  expiresAt: string | null;
  eventsThisMonth: number;
  space: { id: string; name: string; slug: string; logoUrl?: string | null };
  admin: { id: string; fullName: string | null; username: string | null } | null;
}

export interface BillingStats {
  total: number;
  free: number;
  revenueShare: number;
  subscription: number;
  notConfigured: number;
  active: number;
  mrr: number;
}

export interface UpdateSpaceSubscriptionInput {
  billingModel?: BillingModel;
  revenueSharePercent?: number;
  plan?: OrgPlan;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  amount?: number;
  isActive?: boolean;
  reason?: string;
}

/** GET /subscription/admin/spaces */
export const listSpaceSubscriptions = (p: { search?: string; billingModel?: BillingModel; page?: number; limit?: number }) =>
  call<{ data: SpaceSubscription[]; total: number }>(`/subscription/admin/spaces${qs(p)}`);
/** GET /subscription/admin/spaces/stats */
export const getSpaceBillingStats = () => call<BillingStats>('/subscription/admin/spaces/stats');
/** PATCH /subscription/admin/space/:spaceId */
export const updateSpaceSubscription = (spaceId: string, input: UpdateSpaceSubscriptionInput) =>
  call<SpaceSubscription>(`/subscription/admin/space/${spaceId}`, json('PATCH', input));

// ── Sessions (Unifesto Huddle) ───────────────────────────────────────────────

export type AdminSessionStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export interface AdminSession {
  id: string;
  title: string;
  slug: string;
  status: AdminSessionStatus;
  platform: string;
  startDateTime: string;
  durationMinutes: number;
  capacity: number | null;
  registeredCount: number;
  price: string | number;
  space: { id: string; name: string } | null;
  creator: { fullName: string | null; username: string | null };
  sales: { grossSales: number; processingFees: number; refunded: number; paidRegistrations: number };
}

export interface AdminSessionDetail extends AdminSession {
  description: string | null;
  meetingUrl: string | null;
  cancellationReason: string | null;
  attendees: {
    id: string;
    status: string;
    paymentStatus: string;
    totalAmount: string | number;
    registeredAt: string;
    user: { id: string; fullName: string | null; username: string | null };
  }[];
}

/** GET /admin/sessions */
export const listAdminSessions = (p: { search?: string; status?: AdminSessionStatus; page?: number; limit?: number }) =>
  call<{ sessions: AdminSession[]; pagination: { total: number } }>(`/admin/sessions${qs(p)}`);
/** GET /admin/sessions/:id */
export const getAdminSession = (id: string) => call<AdminSessionDetail>(`/admin/sessions/${id}`);

// ── API logs ─────────────────────────────────────────────────────────────────

export type LogStatusFilter = 'success' | 'client_error' | 'server_error' | 'error';

export interface ApiLog {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface LogStats {
  total: number;
  last24h: number;
  errors24h: number;
  avgDurationMs: number;
}

/** GET /admin/logs */
export const listLogs = (p: { search?: string; status?: LogStatusFilter; page?: number; limit?: number }) =>
  call<{ logs: ApiLog[]; pagination: { total: number } }>(`/admin/logs${qs(p)}`);
/** GET /admin/logs/stats */
export const getLogStats = () => call<LogStats>('/admin/logs/stats');

// ── Blog ─────────────────────────────────────────────────────────────────────

export type BlogStatus = 'DRAFT' | 'PUBLISHED';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  coverImageUrl: string | null;
  featured: boolean;
  status: BlogStatus;
  publishedAt: string | null;
  updatedAt: string;
}

export interface BlogInput {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  coverImageUrl?: string;
  featured?: boolean;
  status?: BlogStatus;
}

/** GET /blog/admin — every post, any status. */
export const getBlogPosts = () => call<BlogPost[]>('/blog/admin');
export const createBlogPost = (input: BlogInput) => call<BlogPost>('/blog', json('POST', input));
export const updateBlogPost = (id: string, input: Partial<BlogInput>) => call<BlogPost>(`/blog/${id}`, json('PATCH', input));
export const deleteBlogPost = (id: string) => call<{ deleted: boolean }>(`/blog/${id}`, { method: 'DELETE' });
/** POST /blog/cover → hosted URL. */
export const uploadBlogCover = (uri: string) => uploadImage<{ url: string }>('/blog/cover', 'file', uri);

// ── Careers ──────────────────────────────────────────────────────────────────

export type CareerStatus = 'OPEN' | 'CLOSED' | 'DRAFT';
export type ApplicationStatus = 'NEW' | 'REVIEWING' | 'SHORTLISTED' | 'REJECTED' | 'HIRED';

export interface Career {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  experienceLevel: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  salaryRange: string | null;
  status: CareerStatus;
  updatedAt: string;
  _count?: { applications: number };
}

export type CareerInput = Omit<Career, 'id' | 'updatedAt' | '_count' | 'salaryRange'> & { salaryRange?: string };

export interface CareerApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  resumeUrl: string;
  coverLetter: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  status: ApplicationStatus;
  createdAt: string;
}

export const getCareers = () => call<Career[]>('/careers/admin');
export const createCareer = (input: CareerInput) => call<Career>('/careers', json('POST', input));
export const updateCareer = (id: string, input: Partial<CareerInput>) => call<Career>(`/careers/${id}`, json('PATCH', input));
export const deleteCareer = (id: string) => call<{ deleted: boolean }>(`/careers/${id}`, { method: 'DELETE' });
export const getCareerApplications = (careerId: string) =>
  call<{ career: { id: string; title: string } | null; applications: CareerApplication[] }>(`/careers/${careerId}/applications`);
export const updateApplicationStatus = (id: string, status: ApplicationStatus) =>
  call<CareerApplication>(`/careers/applications/${id}`, json('PATCH', { status }));

export type { Result };
