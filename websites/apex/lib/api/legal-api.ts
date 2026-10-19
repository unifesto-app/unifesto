/**
 * Legal documents (I2): versioned Terms, Privacy and the rest. Backed by the
 * NestJS `/legal/admin` routes (ADMIN only). Published versions are frozen;
 * each slug has at most one open draft, which publishing turns into a version.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export interface LegalVersion {
  id: string;
  slug: string;
  version: number;
  title: string;
  summary: string | null;
  requiresAcceptance: boolean;
  publishedAt: string | null;
  updatedAt: string;
  _count: { acceptances: number };
}

export interface LegalDocument extends Omit<LegalVersion, "_count"> {
  body: string;
}

export interface LegalDraftInput {
  title: string;
  body: string;
  summary?: string;
  requiresAcceptance: boolean;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

export const listLegalVersions = (): Result<LegalVersion[]> =>
  apiCall<LegalVersion[]>(backendClient.get("/legal/admin"));

export const getLegalDocument = (id: string): Result<LegalDocument> =>
  apiCall<LegalDocument>(backendClient.get(`/legal/admin/${id}`));

export const saveLegalDraft = (slug: string, input: LegalDraftInput): Result<LegalDocument> =>
  apiCall<LegalDocument>(backendClient.put(`/legal/admin/${slug}/draft`, input));

export const publishLegalDocument = (id: string): Result<LegalDocument> =>
  apiCall<LegalDocument>(backendClient.post(`/legal/admin/${id}/publish`));
