import { call } from './manageEvent';

/*
 * Apex "Communication" endpoints, mobile side: push broadcasts, email campaigns
 * + the global template library, and the WhatsApp template blast. All are
 * @Roles(ADMIN) on the server, same as the Apex web console.
 */

const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

// ── Push broadcasts (/admin/push/campaigns) ──────────────────────────────────

export type PushCampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type PushTargetType = 'all' | 'event' | 'space' | 'users';
export type PushCategory = 'productUpdates' | 'promotions';

export interface PushTarget {
  type: PushTargetType;
  eventId?: string;
  spaceId?: string;
  /** `users` target: hand-picked accounts. */
  userIds?: string[];
}

/** Server cap on a `users` target (MAX_DIRECT_PUSH_USERS). */
export const MAX_PUSH_USERS = 100;

export interface PushCampaign {
  id: string;
  scope: 'PLATFORM' | 'EVENT';
  eventId: string | null;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  category: string;
  targetSegment: PushTarget | null;
  status: PushCampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

export interface CreatePushBroadcast {
  title: string;
  body: string;
  target: PushTarget;
  category?: PushCategory;
  deepLink?: string;
  /** ISO; omitted = send now. */
  scheduledAt?: string;
}

export const listPushCampaigns = (page = 1, limit = 20) =>
  call<{ items: PushCampaign[]; total: number; page: number; limit: number }>(`/admin/push/campaigns${qs({ page, limit })}`);
export const createPushBroadcast = (body: CreatePushBroadcast) => call<PushCampaign>('/admin/push/campaigns', post(body));
export const sendPushCampaign = (id: string) => call<{ status: string }>(`/admin/push/campaigns/${id}/send`, post());
export const cancelPushCampaign = (id: string) => call<{ status: string }>(`/admin/push/campaigns/${id}/cancel`, post());
/** Remove from the history (not while sending). Can't unsend what phones already got. */
export const deletePushCampaign = (id: string) => call<{ success: boolean }>(`/admin/push/campaigns/${id}`, { method: 'DELETE' });

// ── Email campaigns (/admin/email) ───────────────────────────────────────────

export type EmailTargetType =
  | 'ALL_USERS'
  | 'ORGANISERS_ONLY'
  | 'SEGMENT'
  | 'SPACE_MEMBERS'
  | 'EVENT_REGISTRANTS'
  | 'WAITLIST'
  | 'SINGLE_USER';

export type EmailCampaignStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SCHEDULED' | 'CANCELLED';

export interface SegmentFilters {
  joinedAfter?: string;
  hasRegistrations?: boolean;
}

export interface EmailCampaign {
  id: string;
  subject: string;
  subjectB: string | null;
  abSplitPct: number | null;
  body: string;
  targetType: EmailTargetType;
  targetId: string | null;
  totalSent: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  status: EmailCampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface EmailCampaignLog {
  id: string;
  recipientEmail: string;
  variant: string | null;
  status: 'SENT' | 'FAILED' | 'BOUNCED';
  errorMessage: string | null;
  openedAt: string | null;
  firstClickedAt: string | null;
}

export interface AbVariantStats {
  sent: number;
  opens: number;
  clicks: number;
}

export interface EmailCampaignDetail extends EmailCampaign {
  logs: EmailCampaignLog[];
  stats: { a: AbVariantStats; b: AbVariantStats } | null;
}

export interface CreateEmailCampaign {
  targetType: EmailTargetType;
  targetId?: string;
  subject: string;
  subjectB?: string;
  abSplitPct?: number;
  body: string;
  segmentFilters?: SegmentFilters;
  scheduledAt?: string;
}

export const listEmailCampaigns = (page = 1, limit = 20) =>
  call<{ data: EmailCampaign[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `/admin/email/campaigns${qs({ page, limit })}`,
  );
export const getEmailCampaign = (id: string) => call<EmailCampaignDetail>(`/admin/email/campaigns/${id}`);
export const createEmailCampaign = (body: CreateEmailCampaign) => call<{ campaignId: string }>('/admin/email/campaigns', post(body));
export const cancelEmailCampaign = (id: string) => call<{ success: boolean }>(`/admin/email/campaigns/${id}/cancel`, post());
/** Renders a body with sample merge values, as the recipient would see it. */
export const previewEmailBody = (body: string) => call<{ html: string }>('/admin/email/preview', post({ body }));

// ── Email templates (global library) ─────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[] | null;
  updatedAt: string;
}

export interface EmailTemplatePayload {
  name: string;
  subject: string;
  body: string;
}

export const listEmailTemplates = () => call<EmailTemplate[]>('/admin/email/templates');
export const getEmailTemplate = (id: string) => call<EmailTemplate>(`/admin/email/templates/${id}`);
export const createEmailTemplate = (body: EmailTemplatePayload) => call<EmailTemplate>('/admin/email/templates', post(body));
export const updateEmailTemplate = (id: string, body: Partial<EmailTemplatePayload>) =>
  call<EmailTemplate>(`/admin/email/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteEmailTemplate = (id: string) => call<{ success: boolean }>(`/admin/email/templates/${id}`, { method: 'DELETE' });

// ── WhatsApp template blast (/admin/whatsapp/broadcast) ──────────────────────

export type WhatsappAudience = 'ALL' | 'SPACE' | 'USER';

export interface WhatsappTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  bodyText: string | null;
  bodyParamCount: number;
  needsMediaHeader: boolean;
}

export interface BroadcastSpace {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

export interface BroadcastUser {
  id: string;
  name: string;
  username: string | null;
  mobileMasked: string;
}

export interface WhatsappBroadcastParams {
  audience: WhatsappAudience;
  spaceId?: string;
  userIds?: string[];
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
}

export const listWhatsappTemplates = () => call<WhatsappTemplate[]>('/admin/whatsapp/templates');
export const listBroadcastSpaces = () => call<BroadcastSpace[]>('/admin/whatsapp/broadcast/spaces');
export const searchBroadcastUsers = (search: string) => call<BroadcastUser[]>(`/admin/whatsapp/broadcast/users${qs({ search })}`);
export const sendWhatsappBroadcast = (body: WhatsappBroadcastParams) =>
  call<{ audience: WhatsappAudience; recipientCount: number; status: 'started' }>('/admin/whatsapp/broadcast', post(body));
/** POST /admin/whatsapp/broadcast/audience: distinct numbers the blast would reach now. */
export const countWhatsappAudience = (
  body: Pick<WhatsappBroadcastParams, 'audience' | 'spaceId' | 'userIds'> & Partial<Pick<WhatsappBroadcastParams, 'templateName' | 'languageCode'>>,
) =>
  call<{ recipientCount: number }>('/admin/whatsapp/broadcast/audience', post(body));
/** POST /admin/whatsapp/broadcast/test: the template to my own number only. */
export const sendWhatsappTest = (body: Pick<WhatsappBroadcastParams, 'templateName' | 'languageCode' | 'bodyParams'>) =>
  call<{ recipientCount: number; status: 'started' }>('/admin/whatsapp/broadcast/test', post(body));
