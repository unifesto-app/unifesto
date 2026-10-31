import { call, type Result } from './manageEvent';

/*
 * Apex Huddle sessions, which were web-only. Same endpoints as
 * websites/apex/lib/api/*; shapes trimmed to what the mobile screens show.
 */

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

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

export type { Result };
