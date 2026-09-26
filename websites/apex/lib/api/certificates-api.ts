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
  { family: "Oswald", category: "Display" },
  { family: "Playfair Display", category: "Serif" },
  { family: "Lora", category: "Serif" },
  { family: "Merriweather", category: "Serif" },
  { family: "Great Vibes", category: "Script" },
  { family: "Pacifico", category: "Script" },
];

/** Google Fonts stylesheet href that loads the non-system families for preview. */
export const CERTIFICATE_FONTS_STYLESHEET =
  "https://fonts.googleapis.com/css2?" +
  [
    "Montserrat:wght@400;700",
    "Poppins:wght@400;700",
    "Oswald:wght@400;700",
    "Playfair+Display:wght@400;700",
    "Lora:wght@400;700",
    "Merriweather:wght@400;700",
    "Great+Vibes",
    "Pacifico",
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
}

export interface IssueSummary {
  total: number;
  issued: number;
  skipped: number;
  failed: number;
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

/** `DELETE /certificates/templates/:templateId` — also deletes its certificates. */
export async function deleteTemplate(
  templateId: string
): Result<{ deleted: boolean; certificatesDeleted: number }> {
  return apiCall<{ deleted: boolean; certificatesDeleted: number }>(
    backendClient.delete(`/certificates/templates/${templateId}`)
  );
}

// ============================================================================
// ISSUANCE
// ============================================================================

/** The post-event window during which new certificates may still be issued. */
export interface IssuanceWindow {
  /** ISO timestamp when issuance closes (event end + grace period). */
  closesAt: string;
  /** True while issuing new certificates is still permitted. */
  isOpen: boolean;
}

/**
 * `GET /events/:eventId/certificates/issuance-window` — read the deadline so the
 * UI can show a countdown and disable "Issue" once the window has closed.
 */
export async function getIssuanceWindow(
  eventId: string
): Result<IssuanceWindow> {
  return apiCall<IssuanceWindow>(
    backendClient.get(`/events/${eventId}/certificates/issuance-window`)
  );
}

/** `POST /events/:eventId/certificates/issue` — returns a batch summary. */
export async function issueCertificates(
  eventId: string,
  input: IssueInput
): Result<IssueSummary> {
  return apiCall<IssueSummary>(
    backendClient.post(`/events/${eventId}/certificates/issue`, input)
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

/** `POST /certificates/:certificateId/revoke`. */
export async function revokeCertificate(
  certificateId: string,
  reason?: string
): Result<IssuedCertificate> {
  return apiCall<IssuedCertificate>(
    backendClient.post(`/certificates/${certificateId}/revoke`, { reason })
  );
}
