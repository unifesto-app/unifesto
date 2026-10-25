import { call, type Result } from './manageEvent';
import { uploadImage } from './upload';

/*
 * Platform-admin (Apex) endpoints, mobile side. Every call here is
 * @Roles(ADMIN) on the server; the Apex tab is only shown to platform admins.
 */

type Page = { page: number; limit: number; total: number; totalPages: number };

const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

// ── Overview ─────────────────────────────────────────────────────────────────

export interface PlatformOverview {
  users: { total: number; newLast30Days: number };
  spaces: { total: number; active: number; pendingRequests: number };
  events: { total: number; published: number };
  registrations: { total: number };
  revenue: { totalPaid: number };
  generatedAt: string;
}

/** GET /admin/analytics/overview — the numbers on Apex's dashboard home. */
export const getPlatformOverview = () => call<PlatformOverview>('/admin/analytics/overview');

/** Backend buckets in IST; `today` is hourly, `7d`/`1m` daily, longer ranges monthly. */
export type AnalyticsRange = 'today' | '7d' | '1m' | '6m' | '12m' | '24m';

export interface FinancialPoint {
  period: string;
  label: string;
  collected: number;
  processingFees: number;
  refunded: number;
  netRevenue: number;
  registrations: number;
}

/** GET /admin/analytics/financial-timeseries — money per bucket, zeros back-filled. */
export const getFinancialTimeseries = (range: AnalyticsRange = '6m') =>
  call<{ months: FinancialPoint[] }>(`/admin/analytics/financial-timeseries?range=${range}`);

export interface GrowthPoint {
  period: string;
  label: string;
  newUsers: number;
  cumulativeUsers: number;
  newSpaces: number;
  newEvents: number;
  newRegistrations: number;
}

/** GET /admin/analytics/growth-timeseries — new + running totals per bucket. */
export const getGrowthTimeseries = (range: AnalyticsRange = '6m') =>
  call<{
    months: GrowthPoint[];
    /** Point-in-time snapshots, not bucketed. */
    eventsByStatus: { status: string; count: number }[];
    spacesByStatus: { status: string; count: number }[];
  }>(`/admin/analytics/growth-timeseries?range=${range}`);

// ── Approval queues (raw shapes; normalised in lib/apexQueues.ts) ────────────

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type Decision = 'APPROVED' | 'REJECTED';

export interface PersonRef {
  id: string;
  fullName: string | null;
  username: string | null;
  mobileNumber?: string | null;
  avatarUrl?: string | null;
  identities?: { email: string | null }[];
}

export interface SpaceRef {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
}

interface Reviewed {
  id: string;
  status: RequestStatus;
  reviewNote: string | null;
  createdAt: string;
}

export interface SpaceRequest extends Reviewed {
  name: string;
  description: string | null;
  type: string;
  city: string | null;
  state: string | null;
  websiteUrl: string | null;
  /** Requester's role at the organisation, e.g. "President, Coding Club". */
  requesterRole?: string | null;
  /** When the requester declared authority to represent the organisation. */
  authorityConfirmedAt?: string | null;
  user: PersonRef;
}

export interface StatusRequest extends Reviewed {
  space: SpaceRef;
  user: PersonRef;
  currentStatus: string;
  requestedStatus: string;
  reason: string;
}

export interface OwnershipRequest extends Reviewed {
  space?: SpaceRef;
  requester?: PersonRef;
  newOwner?: PersonRef;
  reason: string;
}

export type SubSpaceRequestType =
  | 'JOIN_SUPER'
  | 'CONVERT_AND_JOIN'
  | 'CONVERT_TO_SUPER'
  | 'CONVERT_TO_REGULAR'
  | 'REMOVE_CHILD'
  | 'REMOVE_PARENT';

export interface SubSpaceRequest extends Reviewed {
  requestType: SubSpaceRequestType;
  subSpace: SpaceRef | null;
  targetSpace: SpaceRef;
  user: PersonRef;
  reason: string;
}

export interface TransferRequest extends Reviewed {
  targetEmail: string;
  reason: string | null;
  registration: {
    id: string;
    groupSize: number | null;
    event: { id: string; title: string; slug: string };
    ticketType: { id: string; name: string } | null;
    user: PersonRef;
  };
  requester: PersonRef;
}

export interface FreeAddRequest extends Reviewed {
  event: { id: string; title: string; slug: string } | null;
  space: SpaceRef | null;
  requester: PersonRef;
  reason: string;
}

export interface WhiteLabelRequest extends Reviewed {
  space: SpaceRef;
  event: { id: string; title: string; slug: string } | null;
  requester: PersonRef;
  brandColor: string | null;
  reason: string;
  /** Whether the space's plan includes white-label right now. */
  planHasBranding?: boolean;
}

/** GET /spaces/requests?status= — a plain array. */
export const getSpaceRequests = (status: RequestStatus) => call<SpaceRequest[]>(`/spaces/requests${qs({ status })}`);
export const approveSpaceRequest = (id: string) => call<unknown>(`/spaces/requests/${id}/approve`, { method: 'PATCH' });
export const rejectSpaceRequest = (id: string, reviewNote?: string) =>
  call<unknown>(`/spaces/requests/${id}/reject`, patch({ reviewNote: reviewNote || undefined }));

export const getStatusRequests = (status: RequestStatus) =>
  call<{ requests: StatusRequest[]; pagination: Page }>(`/spaces/status-requests${qs({ status, limit: 100 })}`);
export const reviewStatusRequest = (id: string, status: Decision, reviewNote?: string) =>
  call<unknown>(`/spaces/status-requests/${id}/review`, patch({ status, reviewNote: reviewNote || undefined }));

export const getOwnershipRequests = (status: RequestStatus) =>
  call<{ requests: OwnershipRequest[]; pagination: Page }>(`/spaces/ownership-requests${qs({ status, limit: 100 })}`);
export const reviewOwnershipRequest = (id: string, status: Decision, reviewNote?: string) =>
  call<unknown>(`/spaces/ownership-requests/${id}/review`, patch({ status, reviewNote: reviewNote || undefined }));

export const getSubSpaceRequests = (status: RequestStatus) =>
  call<{ items: SubSpaceRequest[]; total: number }>(`/spaces/sub-space-requests${qs({ status, limit: 100 })}`);
export const reviewSubSpaceRequest = (id: string, status: Decision, reviewNote?: string) =>
  call<unknown>(`/spaces/sub-space-requests/${id}/review`, patch({ status, reviewNote: reviewNote || undefined }));

export const getTransferRequests = (status: RequestStatus) =>
  call<{ requests: TransferRequest[]; pagination: Page }>(`/registration-transfer-requests${qs({ status, limit: 100 })}`);
/** Approving performs the transfer; `email` overrides the requested target. */
export const reviewTransferRequest = (id: string, status: Decision, reviewNote?: string, email?: string) =>
  call<unknown>(
    `/registration-transfer-requests/${id}/review`,
    patch({ status, reviewNote: reviewNote || undefined, email: email || undefined }),
  );

export const getFreeAddRequests = (status: RequestStatus) =>
  call<{ requests: FreeAddRequest[]; pagination: Page }>(`/free-attendee-add/requests${qs({ status, limit: 100 })}`);
export const reviewFreeAddRequest = (id: string, status: Decision, reviewNote?: string) =>
  call<unknown>(`/free-attendee-add/requests/${id}/review`, patch({ status, reviewNote: reviewNote || undefined }));

export const getWhiteLabelRequests = (status: RequestStatus) =>
  call<{ requests: WhiteLabelRequest[]; pagination: Page }>(`/white-label/requests${qs({ status, limit: 100 })}`);
export const reviewWhiteLabelRequest = (id: string, status: Decision, reviewNote?: string) =>
  call<unknown>(`/white-label/requests/${id}/review`, patch({ status, reviewNote: reviewNote || undefined }));

// ── Refunds (final stage) ────────────────────────────────────────────────────

/** Uses the shared RefundRequest shape from lib/api/finance. */
export type AdminRefundStatus = 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'REFUND_FAILED' | 'PROCESSING';

/** GET /refunds/admin/all — every refund request on the platform. */
export const getAdminRefunds = <T>(status: AdminRefundStatus, page = 1, limit = 30) =>
  call<{ requests: T[]; pagination: Page }>(`/refunds/admin/all${qs({ status, page, limit })}`);

/** PATCH /refunds/:id/admin-decision — approve (optionally partial) sends the money back via Razorpay. */
export const decideRefund = (id: string, action: 'APPROVE' | 'REJECT', opts: { approvedAmount?: number; note?: string }) =>
  call<{ approvedAmount: string | null; adminNote: string | null }>(`/refunds/${id}/admin-decision`, patch({ action, approvedAmount: opts.approvedAmount, note: opts.note || undefined }));

// ── Payouts ──────────────────────────────────────────────────────────────────

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface AdminPayout {
  id: string;
  eventId: string;
  grossRevenue: string;
  platformFeePercent: string;
  platformFee: string;
  netAmount: string;
  status: PayoutStatus;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
  utr: string | null;
  notes: string | null;
  event?: { id: string; title: string; slug: string } | null;
  /** A Huddle session payout has this instead of an event (T6). */
  session?: { id: string; title: string; slug: string } | null;
  user?: { id: string; fullName: string | null; username: string | null } | null;
  bankAccount?: {
    methodType?: 'BANK' | 'UPI';
    bankName: string | null;
    accountNumber: string | null;
    ifscCode?: string | null;
    upiId: string | null;
    accountHolderName?: string;
  } | null;
}

/** GET /payouts/admin — every payout, newest first. */
export const getAdminPayouts = (status: PayoutStatus, page = 1, limit = 30) =>
  call<{ payouts: AdminPayout[]; pagination: Page }>(`/payouts/admin${qs({ status, page, limit })}`);

/** POST /payouts/admin/:id/process — records the manual transfer as done. */
export const markPayoutPaid = (id: string, utr: string) => call<AdminPayout>(`/payouts/admin/${id}/process`, post({ utr }));

/** PATCH /payouts/admin/:id/cancel — pending payouts only. */
export const cancelPayout = (id: string) => call<AdminPayout>(`/payouts/admin/${id}/cancel`, { method: 'PATCH' });

// ── WhatsApp inbox ───────────────────────────────────────────────────────────

export interface WhatsappMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string | null;
  mediaNote: string | null;
  mediaUrl: string | null;
  status: string | null;
  errorText: string | null;
  createdAt: string;
}

export interface WhatsappConversation {
  id: string;
  waId: string;
  profileName: string | null;
  userId: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string;
  unreadCount: number;
  /** Free-form replies are only allowed within 24h of their last message. */
  replyWindowOpen: boolean;
  /** D26: the Assist case this thread was converted into, if any. */
  caseId: string | null;
  messages?: WhatsappMessage[];
}

export const getWhatsappStats = () => call<{ conversations: number; unread: number; openWindows: number }>('/admin/whatsapp/stats');

export const getWhatsappConversations = (search?: string, page = 1) =>
  call<{ conversations: WhatsappConversation[]; pagination: Page }>(`/admin/whatsapp/conversations${qs({ search, page, limit: 30 })}`);

/** Opening a thread marks it read. */
export const getWhatsappConversation = (id: string) => call<WhatsappConversation>(`/admin/whatsapp/conversations/${id}`);

export const replyWhatsapp = (id: string, body: string) =>
  call<{ id: string; status: string }>(`/admin/whatsapp/conversations/${id}/reply`, post({ body }));

/** D26: copy the picked messages into a Platform HELP case. Idempotent: a second call returns the same case. */
export const convertWhatsappToCase = (id: string, messageIds: string[]) =>
  call<{ caseId: string }>(`/admin/whatsapp/conversations/${id}/case`, post({ messageIds }));

const MEDIA_LABEL: Record<string, string> = {
  image: 'Photo',
  sticker: 'Sticker',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  location: 'Location',
  contacts: 'Contact',
};

export const conversationName = (c: WhatsappConversation) => c.profileName || `+${c.waId}`;

export function messagePreview(m?: WhatsappMessage): string {
  if (!m) return 'No messages yet';
  if (m.body) return m.body;
  return MEDIA_LABEL[m.type] ?? m.mediaNote ?? `[${m.type}]`;
}

// ── Lookup ───────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  mobileNumber: string | null;
  avatarUrl: string | null;
  roles: string[];
  appVersion: string | null;
  appPlatform: string | null;
  createdAt: string;
}

/** A OneSignal push subscription (one app install) linked to the account. */
export interface AdminUserPushDevice {
  id: string;
  /** OneSignal push subscription id: the "device id". */
  subscriptionId: string;
  platform: string;
  deviceModel: string | null;
  appVersion: string | null;
  /** Push permission granted + subscribed on the device. */
  optedIn: boolean;
  /** When the backend linked OneSignal external_id = user id; null = not linked. */
  linkedAt: string | null;
  linkError: string | null;
  lastSeenAt: string;
}

export interface AdminUserDetail {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  mobileNumber: string | null;
  mobileVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  appVersion: string | null;
  appPlatform: string | null;
  appVersionLastReportedAt: string | null;
  roles: {
    id: string;
    code: string;
    name: string;
    scope: string;
    spaceId: string | null;
    spaceName: string | null;
    assignedBy: { id: string; fullName: string | null; username: string | null } | null;
    assignedAt: string;
  }[];
  identities: { id: string; provider: string; email: string | null; emailVerified: boolean; isPrimary: boolean }[];
  pushDevices?: AdminUserPushDevice[];
  createdAt: string;
}

/** Profile fields a platform admin can edit. `null` clears a field server-side. */
export interface AdminUserPatch {
  fullName?: string | null;
  username?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}

export const searchUsers = (search: string, page = 1) =>
  call<{ users: AdminUserRow[]; pagination: Page }>(`/admin/users${qs({ search, page, limit: 30 })}`);
export const getAdminUser = (id: string) => call<{ user: AdminUserDetail }>(`/admin/users/${id}`);
export const updateAdminUser = (id: string, body: AdminUserPatch) => call<unknown>(`/admin/users/${id}`, patch(body));
export const uploadAdminUserAvatar = (id: string, uri: string) =>
  uploadImage<{ avatarUrl: string }>(`/admin/users/${id}/avatar`, 'avatar', uri);
export const removeAdminUserAvatar = (id: string) => call<{ avatarUrl: null }>(`/admin/users/${id}/avatar`, { method: 'DELETE' });

export interface AdminSpaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  visibility: string;
  status: string;
  type: string;
  parentSpace: { id: string; name: string } | null;
  child_count: number;
  member_count: number;
  roleCounts: { spaceAdmins: number; members: number };
  creator: { id: string; fullName: string | null; username: string | null } | null;
  createdAt: string;
}

export const searchSpaces = (search: string, page = 1) =>
  call<{ spaces: AdminSpaceRow[]; pagination: Page }>(`/admin/spaces${qs({ search, page, limit: 30 })}`);

export interface AdminSpaceDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  websiteUrl: string | null;
  tags: string[];
  status: string;
  visibility: string;
  type: string;
  parentSpaceId: string | null;
  creator: { id: string; fullName: string | null; username: string | null } | null;
  parentSpace: { id: string; name: string } | null;
  organisers?: { id: string; user: { id: string; fullName: string | null; username: string | null }; role: { code: string; name: string } }[];
  _count?: { userRoles: number; events: number; childSpaces: number };
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const getSpaceDetail = (id: string) => call<AdminSpaceDetail>(`/spaces/${id}`);

/** Lifecycle states an admin can move an approved space into. */
export const MANAGEABLE_SPACE_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type ManageableSpaceStatus = (typeof MANAGEABLE_SPACE_STATUSES)[number];

export const approveSpace = (id: string) => call<unknown>(`/admin/spaces/${id}/approve`, { method: 'PATCH' });
export const rejectSpace = (id: string, reason?: string) => call<unknown>(`/admin/spaces/${id}/reject`, patch({ reason }));
export const updateSpaceStatus = (id: string, status: ManageableSpaceStatus) =>
  call<unknown>(`/admin/spaces/${id}/status`, patch({ status }));
/** Permanent: cascades to every event, registration, payment and payout under the space. */
export const deleteSpace = (id: string) => call<unknown>(`/spaces/${id}`, { method: 'DELETE' });

export interface ChildSpace {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  _count?: { userRoles?: number };
}

export const getChildSpaces = (parentId: string, page = 1) =>
  call<{ spaces: ChildSpace[]; pagination?: Partial<Page> }>(`/spaces${qs({ parentId, page, limit: 20 })}`);

/** Every space, for the hierarchy picker (admins may attach any space). */
export const getAllSpacesForPicker = () =>
  call<{ spaces: AdminSpaceRow[]; pagination: Page }>(`/admin/spaces${qs({ page: 1, limit: 500 })}`);

export const createSubSpaceRequest = (body: { requestType: SubSpaceRequestType; targetSpaceId: string; subSpaceId?: string; reason: string }) =>
  call<unknown>('/spaces/sub-space-requests', { method: 'POST', body: JSON.stringify(body) });

export interface AdminEventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDateTime: string;
  city: string | null;
  deletedAt: string | null;
  space: { id: string; name: string } | null;
  _count: { registrations: number };
  sales: { grossSales: number; processingFees: number; refunded: number; paidRegistrations: number };
}

export const searchEvents = (opts: { search?: string; status?: string; page?: number }) =>
  call<{ events: AdminEventRow[]; pagination: Page }>(
    `/admin/events${qs({ search: opts.search, status: opts.status, page: opts.page ?? 1, limit: 30 })}`,
  );

export interface AdminEventDetail extends AdminEventRow {
  endDateTime: string | null;
  venueName: string | null;
  coverImageUrl: string | null;
  creator: { id: string; fullName: string | null; username: string | null; email: string | null; mobileNumber: string | null } | null;
  attendeeCount: number;
  ticketTypes: {
    id: string;
    name: string;
    price: string | number;
    kind: string;
    quantity: number | null;
    soldCount: number;
    sales: { grossSales: number; paidRegistrations: number };
  }[];
  parentEvent: { id: string; title: string } | null;
  childEvents: { id: string; title: string; status: string; startDateTime: string }[];
  recentRegistrations: {
    id: string;
    status: string;
    paymentStatus: string;
    totalAmount: string | number;
    createdAt: string;
    user: { id: string; fullName: string | null; username: string | null } | null;
    ticketType: { name: string } | null;
  }[];
}

export const getAdminEvent = (id: string) => call<AdminEventDetail>(`/admin/events/${id}`);

// ── Status ───────────────────────────────────────────────────────────────────

export interface StatusDay {
  date: string; // YYYY-MM-DD (UTC)
  status: 'up' | 'down' | 'partial' | 'nodata';
  uptime: number | null;
}

export interface StatusIncident {
  id: string;
  title: string;
  body: string | null;
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  impact: 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  affectedServices: string[];
  startedAt: string;
  resolvedAt: string | null;
}

export interface PlatformStatus {
  /** Worse of live health and open incidents; 'unknown' when sampling stopped. */
  overall: 'operational' | 'degraded' | 'major_outage' | 'unknown';
  /** No health sample recently: current states are unknown, not green. */
  stale?: boolean;
  updatedAt: string;
  lastSampleAt?: string | null;
  incidentDays?: number;
  services: {
    key: string;
    name: string;
    currentStatus: 'up' | 'down' | 'unknown';
    latencyMs: number | null;
    uptimePercent: number | null;
    /** Oldest → today, one bucket per day. */
    days: StatusDay[];
  }[];
  incidents: StatusIncident[];
}

export const getPlatformStatus = () => call<PlatformStatus>('/admin/status');

/** POST /admin/status/incidents: report an incident by hand. */
export const createStatusIncident = (body: {
  title: string;
  body?: string;
  impact: StatusIncident['impact'];
  affectedServices: string[];
}) => call<StatusIncident>('/admin/status/incidents', post(body));

/** PATCH /admin/status/incidents/:id: RESOLVED stamps resolvedAt on the server. */
export const updateStatusIncident = (id: string, body: { status: StatusIncident['status'] }) =>
  call<StatusIncident>(`/admin/status/incidents/${id}`, patch(body));

/** UptimeRobot's outside view (read-only key on the server; cached a minute). */
export interface ExternalMonitor {
  id: number;
  name: string;
  url: string | null;
  status: 'up' | 'down' | 'degraded' | 'paused' | 'unknown';
  uptime: { day: number | null; week: number | null; month: number | null };
  responseMs: number | null;
  lastDown: { at: string; durationSec: number; reason: string | null } | null;
}

export interface ExternalStatus {
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
  monitors: ExternalMonitor[];
}

export const getExternalStatus = () => call<ExternalStatus>('/admin/status/external');
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Platform Admin',
  SPACE_ADMIN: 'Space Admin',
  CURATOR: 'Curator',
  CO_CURATOR: 'Co-Curator',
  CREW: 'Crew',
};
export const roleLabel = (code: string) => ROLE_LABELS[code] ?? code;

// ── Platform config: app version ─────────────────────────────────────────────

export interface StoreVersionPolicy {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
}

export interface AppVersionPolicy {
  ios: StoreVersionPolicy;
  android: StoreVersionPolicy;
}

/** GET /admin/app-version — drives the in-app update prompt. */
export const getAppVersionPolicy = () => call<AppVersionPolicy>('/admin/app-version');
/** PATCH /admin/app-version — both platforms, full objects. */
export const updateAppVersionPolicy = (body: AppVersionPolicy) => call<AppVersionPolicy>('/admin/app-version', patch(body));

// ── OTA updates (EAS Update, via the backend's Expo token) ───────────────────

export type OtaChannel = 'production' | 'preview';

export interface OtaGroup {
  group: string;
  message: string | null;
  createdAt: string;
  runtimeVersion: string;
  platforms: string[];
  /** Per-platform update ids; matches Updates.updateId on a phone. */
  updateIds: string[];
  /** null when not a staged rollout. */
  rolloutPercentage: number | null;
  controlGroup: string | null;
  isRollBackToEmbedded: boolean;
  gitCommitHash: string | null;
  publishedBy: string | null;
}

/** GET /admin/ota — latest update groups on a channel, newest first. */
export const getOtaGroups = (channel: OtaChannel) =>
  call<{ channel: OtaChannel; groups: OtaGroup[] }>(`/admin/ota${qs({ channel })}`);
/** POST /admin/ota/:group/rollout — move a staged rollout (100 finishes it). */
export const setOtaRollout = (group: string, percentage: number) =>
  call<{ ok: true }>(`/admin/ota/${group}/rollout`, post({ percentage }));
/** POST /admin/ota/:group/revert — delete the rollout, republish the update before it. */
export const revertOtaRollout = (group: string) => call<{ ok: true }>(`/admin/ota/${group}/revert`, post({}));
/** POST /admin/ota/:group/republish — make an earlier update the latest again (rollback). */
export const republishOtaGroup = (group: string) => call<{ ok: true }>(`/admin/ota/${group}/republish`, post({}));

export interface OtaAdoption {
  days: number;
  /** Active = reported in the last `days` days. */
  total: number;
  /** runtimeVersion null = clients too old to report one (4.0.x). */
  byRuntime: { runtimeVersion: string | null; users: number }[];
  /** updateId null = running the store build's own code. */
  byUpdate: { runtimeVersion: string; updateId: string | null; users: number }[];
}
/** GET /admin/ota/adoption — what active phones run, per runtime and per update. */
export const getOtaAdoption = () => call<OtaAdoption>('/admin/ota/adoption');

export interface OtaStaleness {
  /** Last CI report of main; null until CI first posts it. */
  main: { sha: string; otaSafe: boolean; reportedAt: string } | null;
  lastPublish: { group: string; createdAt: string; message: string | null } | null;
  /** Mobile commits on main newer than the last production publish. */
  unshippedCommits: number | null;
  unshippedTruncated: boolean;
  oldestUnshippedAt: string | null;
  expoError: string | null;
}
/** GET /admin/ota/staleness — the stale-OTA alarm. */
export const getOtaStaleness = () => call<OtaStaleness>('/admin/ota/staleness');

// ── Unifesto Stats recipients ────────────────────────────────────────────────

/** GET /admin/stats-recipients — numbers that get the daily/weekly stats WhatsApp. */
export const getStatsRecipients = () => call<{ numbers: string[] }>('/admin/stats-recipients');
/** PUT /admin/stats-recipients — full replacement; server normalises to E.164. */
export const updateStatsRecipients = (numbers: string[]) =>
  call<{ numbers: string[] }>('/admin/stats-recipients', { method: 'PUT', body: JSON.stringify({ numbers }) });

export type { Result };
