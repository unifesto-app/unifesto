/**
 * Certificates API — organiser-side template design + issuance.
 *
 * Backed by the NestJS `/events/:eventId/certificates` and `/certificates`
 * controllers. Gated by the space plan's `hasCertificates`; the backend
 * enforces organiser membership and the plan on every call.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

// ============================================================================
// TYPES
// ============================================================================

export type CertificateFieldKey =
  | "recipientName"
  | "eventTitle"
  | "issueDate"
  | "certificateNumber"
  | "custom"
  | "verifyQr";

/** One positioned element (text or the verify QR), authored against the canvas. */
export interface CertificateField {
  key: CertificateFieldKey;
  /** Static text for a `custom` field. */
  label?: string;
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  /** Text box width, or the QR square side for a `verifyQr` element. */
  maxWidth?: number;
  /** One of CERTIFICATE_FONTS; defaults to Helvetica. */
  fontFamily?: string;
}

/**
 * The fonts an organiser can pick, kept in sync with the backend
 * `certificate-fonts.ts` registry. `Helvetica` is the system default.
 */
export const CERTIFICATE_FONTS: {
  family: string;
  category: "Sans" | "Serif" | "Display" | "Script";
}[] = [
  { family: "Helvetica", category: "Sans" },
  { family: "Montserrat", category: "Sans" },
  { family: "Poppins", category: "Sans" },
  { family: "Roboto", category: "Sans" },
  { family: "Lato", category: "Sans" },
  { family: "Raleway", category: "Sans" },
  { family: "Oswald", category: "Display" },
  { family: "Bebas Neue", category: "Display" },
  { family: "Playfair Display", category: "Serif" },
  { family: "Lora", category: "Serif" },
  { family: "Merriweather", category: "Serif" },
  { family: "Cinzel", category: "Serif" },
  { family: "Cormorant Garamond", category: "Serif" },
  { family: "EB Garamond", category: "Serif" },
  { family: "Great Vibes", category: "Script" },
  { family: "Pacifico", category: "Script" },
  { family: "Dancing Script", category: "Script" },
  { family: "Sacramento", category: "Script" },
  { family: "Allura", category: "Script" },
  { family: "Parisienne", category: "Script" },
  { family: "Satisfy", category: "Script" },
  { family: "Kaushan Script", category: "Script" },
];

/** Google Fonts stylesheet href that loads the non-system families for preview. */
export const CERTIFICATE_FONTS_STYLESHEET =
  "https://fonts.googleapis.com/css2?" +
  [
    "Montserrat:wght@400;700",
    "Poppins:wght@400;700",
    "Roboto:wght@400;700",
    "Lato:wght@400;700",
    "Raleway:wght@400;700",
    "Oswald:wght@400;700",
    "Bebas+Neue",
    "Playfair+Display:wght@400;700",
    "Lora:wght@400;700",
    "Merriweather:wght@400;700",
    "Cinzel:wght@400;700",
    "Cormorant+Garamond:wght@400;700",
    "EB+Garamond:wght@400;700",
    "Great+Vibes",
    "Pacifico",
    "Dancing+Script:wght@400;700",
    "Sacramento",
    "Allura",
    "Parisienne",
    "Satisfy",
    "Kaushan+Script",
  ]
    .map((f) => `family=${f}`)
    .join("&") +
  "&display=swap";

export interface CertificateTemplate {
  id: string;
  eventId: string;
  name: string;
  backgroundUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  fields: CertificateField[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _count?: { certificates: number };
}

/** A template on another event in the same space, offered for reuse/import. */
export interface ReusableTemplate {
  id: string;
  name: string;
  backgroundUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  fields: CertificateField[];
  event: { id: string; title: string };
}

export type CertificateAudience = "CHECKED_IN" | "CONFIRMED" | "MANUAL";
export type CertificateStatus = "ISSUED" | "REVOKED";

export interface IssuedCertificate {
  id: string;
  recipientName: string;
  recipientEmail: string | null;
  certificateNumber: string;
  verificationCode: string;
  audience: CertificateAudience;
  status: CertificateStatus;
  pdfUrl: string | null;
  imageUrl: string | null;
  issuedAt: string;
  revokedAt: string | null;
  /** When the recipient was last emailed a link; null = never delivered. */
  emailedAt: string | null;
}

export interface IssueSummary {
  total: number;
  issued: number;
  /** Revoked certificates reactivated in place (re-rendered, verify link kept). */
  reactivated: number;
  skipped: number;
  failed: number;
}

export type CertificateBatchStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

/** The queue receipt returned when issuance is enqueued. */
export interface EnqueueResult {
  batchId: string;
  status: CertificateBatchStatus;
}

/** A queued issuance batch's live status, polled after enqueue. */
export interface CertificateBatch extends IssueSummary {
  id: string;
  status: CertificateBatchStatus;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateTemplateInput {
  name: string;
  backgroundUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  fields: CertificateField[];
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

export interface IssueInput {
  templateId: string;
  audience: CertificateAudience;
  /** Required when audience is MANUAL. */
  registrationIds?: string[];
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

// ============================================================================
// TEMPLATES
// ============================================================================

/** `POST /events/:eventId/certificates/background` — upload, returns `{ url }`. */
export async function uploadCertificateBackground(
  eventId: string,
  file: File
): Result<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiCall<{ url: string }>(
    backendClient.post(`/events/${eventId}/certificates/background`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/** `GET /events/:eventId/certificates/templates`. */
export async function getTemplates(
  eventId: string
): Result<CertificateTemplate[]> {
  return apiCall<CertificateTemplate[]>(
    backendClient.get(`/events/${eventId}/certificates/templates`)
  );
}

/** `POST /events/:eventId/certificates/templates`. */
export async function createTemplate(
  eventId: string,
  input: CreateTemplateInput
): Result<CertificateTemplate> {
  return apiCall<CertificateTemplate>(
    backendClient.post(`/events/${eventId}/certificates/templates`, input)
  );
}

/** `PATCH /certificates/templates/:templateId`. */
export async function updateTemplate(
  templateId: string,
  input: UpdateTemplateInput
): Result<CertificateTemplate> {
  return apiCall<CertificateTemplate>(
    backendClient.patch(`/certificates/templates/${templateId}`, input)
  );
}

/** `GET /events/:eventId/certificates/templates/reusable` — templates on other events in the space. */
export async function getSpaceTemplates(
  eventId: string
): Result<ReusableTemplate[]> {
  return apiCall<ReusableTemplate[]>(
    backendClient.get(`/events/${eventId}/certificates/templates/reusable`)
  );
}

/** `POST /events/:eventId/certificates/templates/import` — copy a template into this event. */
export async function importTemplate(
  eventId: string,
  sourceTemplateId: string
): Result<CertificateTemplate> {
  return apiCall<CertificateTemplate>(
    backendClient.post(`/events/${eventId}/certificates/templates/import`, {
      sourceTemplateId,
    })
  );
}

/**
 * `DELETE /certificates/templates/:templateId`. A template with issued
 * certificates is retired (`retired: true`) and its certificates stay valid.
 */
export async function deleteTemplate(
  templateId: string
): Result<{ deleted: boolean; certificatesDeleted: number; retired?: boolean }> {
  return apiCall<{ deleted: boolean; certificatesDeleted: number; retired?: boolean }>(
    backendClient.delete(`/certificates/templates/${templateId}`)
  );
}

// ============================================================================
// ISSUANCE
// ============================================================================

/**
 * `POST /events/:eventId/certificates/issue` — enqueues issuance onto the
 * concurrency-bounded worker and returns a batch id to poll via
 * {@link getCertificateBatch}. (Was synchronous; moved to a queue so a large
 * batch can't OOM the backend during PDF/PNG rendering.)
 */
export async function issueCertificates(
  eventId: string,
  input: IssueInput
): Result<EnqueueResult> {
  return apiCall<EnqueueResult>(
    backendClient.post(`/events/${eventId}/certificates/issue`, input)
  );
}

/** `GET /events/:eventId/certificates/batches/:batchId` — poll batch progress. */
export async function getCertificateBatch(
  eventId: string,
  batchId: string
): Result<CertificateBatch> {
  return apiCall<CertificateBatch>(
    backendClient.get(`/events/${eventId}/certificates/batches/${batchId}`)
  );
}

/** `GET /events/:eventId/certificates` — certificates issued for the event. */
export async function getEventCertificates(
  eventId: string
): Result<IssuedCertificate[]> {
  return apiCall<IssuedCertificate[]>(
    backendClient.get(`/events/${eventId}/certificates`)
  );
}

/** Outcome of a resend batch. */
export interface ResendSummary {
  total: number;
  sent: number;
  failed: number;
}

/**
 * `POST /events/:eventId/certificates/resend-emails` — (re)send certificate
 * emails. By default only certificates never successfully emailed are sent;
 * `includeAlreadySent` re-sends to everyone with an email on file.
 */
export async function resendCertificateEmails(
  eventId: string,
  includeAlreadySent = false
): Result<ResendSummary> {
  return apiCall<ResendSummary>(
    backendClient.post(`/events/${eventId}/certificates/resend-emails`, {
      includeAlreadySent,
    })
  );
}

/** `POST /certificates/:certificateId/revoke`. */
export async function revokeCertificate(
  certificateId: string,
  reason?: string
): Result<IssuedCertificate> {
  return apiCall<IssuedCertificate>(
    backendClient.post(`/certificates/${certificateId}/revoke`, { reason })
  );
}

/** `POST /certificates/templates/:templateId/revoke-all` — revoke every certificate from one template. */
export async function revokeTemplateCertificates(
  templateId: string,
  reason?: string
): Result<{ revoked: number }> {
  return apiCall<{ revoked: number }>(
    backendClient.post(`/certificates/templates/${templateId}/revoke-all`, {
      reason,
    })
  );
}

/** Outcome of a single-certificate reissue. */
export interface ReissueSummary {
  reissued: number;
  emailed: number;
}

/** Outcome of a bulk reissue-all-revoked pass. */
export interface ReissueAllSummary {
  total: number;
  reissued: number;
  emailed: number;
  failed: number;
  /** True when the reissue runs in the background; counts are then all 0. */
  queued?: boolean;
}

/**
 * `POST /certificates/:certificateId/reissue` — re-render a single REVOKED
 * certificate from its template's latest design, restore it to ISSUED (keeping
 * its number + verify link), and re-email the recipient.
 */
export async function reissueCertificate(
  certificateId: string
): Result<ReissueSummary> {
  return apiCall<ReissueSummary>(
    backendClient.post(`/certificates/${certificateId}/reissue`)
  );
}

/**
 * `POST /events/:eventId/certificates/reissue-revoked` — reissue every revoked
 * certificate for the event from its latest template, re-emailing each.
 */
export async function reissueRevokedCertificates(
  eventId: string
): Result<ReissueAllSummary> {
  return apiCall<ReissueAllSummary>(
    backendClient.post(`/events/${eventId}/certificates/reissue-revoked`)
  );
}
