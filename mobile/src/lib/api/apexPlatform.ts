import { call, type Result } from './manageEvent';

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

// ── Plans & billing models ───────────────────────────────────────────────────

export type OrgPlan = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
export type BillingModel = 'FREE' | 'REVENUE_SHARE' | 'SUBSCRIPTION';

export const PLAN_LABEL: Record<OrgPlan, string> = { STARTER: 'Starter', GROWTH: 'Growth', PRO: 'Pro', ENTERPRISE: 'Enterprise' };

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

export type { Result };
