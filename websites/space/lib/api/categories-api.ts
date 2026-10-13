/**
 * Categories API — event category taxonomy. Backed by `/categories`.
 *
 * List is public (`GET /categories`).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/** Category shape returned by the list endpoint (`GET /categories`). */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  order: number;
  event_count: number;
}

/** List all active categories with per-category upcoming event counts. */
export async function getCategories(): Promise<{
  data: Category[] | null;
  error: ApiError | null;
}> {
  return apiCall<Category[]>(backendClient.get("/categories"));
}
