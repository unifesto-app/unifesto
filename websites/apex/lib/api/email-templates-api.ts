/**
 * Email templates API — the GLOBAL library (platform). Every space sees these
 * as read-only starting points; only Platform Admins create/edit/delete them,
 * over `/admin/email/templates*`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type EmailTemplateScope = "GLOBAL" | "SPACE";

export interface EmailTemplate {
  id: string;
  scope: EmailTemplateScope;
  spaceId: string | null;
  name: string;
  subject: string;
  body: string;
  variables: string[] | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePayload {
  name: string;
  subject: string;
  body: string;
  variables?: string[];
}

/** `GET /admin/email/templates`. */
export async function listTemplates(): Promise<{
  data: EmailTemplate[] | null;
  error: ApiError | null;
}> {
  return apiCall<EmailTemplate[]>(backendClient.get("/admin/email/templates"));
}

/** `GET /admin/email/templates/:id`. */
export async function getTemplate(
  id: string
): Promise<{ data: EmailTemplate | null; error: ApiError | null }> {
  return apiCall<EmailTemplate>(
    backendClient.get(`/admin/email/templates/${id}`)
  );
}

/** `POST /admin/email/templates`. */
export async function createTemplate(
  payload: TemplatePayload
): Promise<{ data: EmailTemplate | null; error: ApiError | null }> {
  return apiCall<EmailTemplate>(
    backendClient.post("/admin/email/templates", payload)
  );
}

/** `PATCH /admin/email/templates/:id`. */
export async function updateTemplate(
  id: string,
  payload: Partial<TemplatePayload>
): Promise<{ data: EmailTemplate | null; error: ApiError | null }> {
  return apiCall<EmailTemplate>(
    backendClient.patch(`/admin/email/templates/${id}`, payload)
  );
}

/** `DELETE /admin/email/templates/:id`. */
export async function deleteTemplate(
  id: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/admin/email/templates/${id}`));
}
