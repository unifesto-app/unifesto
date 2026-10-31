/**
 * Space email templates API — over `/spaces/:spaceId/email/templates*`. Lists
 * the space's own templates PLUS the platform GLOBAL library (read-only). Only
 * SPACE-scoped templates can be edited or deleted by the space.
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

const base = (spaceId: string) => `/spaces/${spaceId}/email/templates`;

export async function listTemplates(
  spaceId: string
): Promise<{ data: EmailTemplate[] | null; error: ApiError | null }> {
  return apiCall<EmailTemplate[]>(backendClient.get(base(spaceId)));
}

export async function createTemplate(
  spaceId: string,
  payload: TemplatePayload
): Promise<{ data: EmailTemplate | null; error: ApiError | null }> {
  return apiCall<EmailTemplate>(backendClient.post(base(spaceId), payload));
}

export async function updateTemplate(
  spaceId: string,
  id: string,
  payload: Partial<TemplatePayload>
): Promise<{ data: EmailTemplate | null; error: ApiError | null }> {
  return apiCall<EmailTemplate>(
    backendClient.patch(`${base(spaceId)}/${id}`, payload)
  );
}

export async function deleteTemplate(
  spaceId: string,
  id: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`${base(spaceId)}/${id}`));
}
