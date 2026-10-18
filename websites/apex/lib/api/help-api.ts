/**
 * Help articles API (D17): admin management of the public help centre that
 * also feeds the Assist bot. Backed by the NestJS `/help` controller; public
 * list/detail are open, CRUD is ADMIN-guarded.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type HelpArticleStatus = "DRAFT" | "PUBLISHED";

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  status: HelpArticleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HelpArticleInput {
  title: string;
  slug?: string;
  body: string;
  category: string;
  status?: HelpArticleStatus;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

/** `GET /help/admin` — every article, any status. */
export async function getAllArticles(): Result<HelpArticle[]> {
  return apiCall<HelpArticle[]>(backendClient.get("/help/admin"));
}

/** `POST /help`. */
export async function createArticle(input: HelpArticleInput): Result<HelpArticle> {
  return apiCall<HelpArticle>(backendClient.post("/help", input));
}

/** `PATCH /help/:id`. */
export async function updateArticle(
  id: string,
  input: Partial<HelpArticleInput>
): Result<HelpArticle> {
  return apiCall<HelpArticle>(backendClient.patch(`/help/${id}`, input));
}

/** `DELETE /help/:id`. */
export async function deleteArticle(id: string): Result<{ deleted: boolean }> {
  return apiCall<{ deleted: boolean }>(backendClient.delete(`/help/${id}`));
}
