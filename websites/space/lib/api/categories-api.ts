/**
 * Categories API — event category taxonomy. Backed by `/categories`.
 *
 * List is public (`GET /categories`); mutations require the JWT (admin surface).
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

/** Row returned by create/update — no computed `event_count`. */
export interface CategoryMutationResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
  bannerUrl?: string;
  iconUrl?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
  bannerUrl?: string;
  iconUrl?: string;
  order?: number;
}

/** List all active categories with per-category upcoming event counts. */
export async function getCategories(): Promise<{
  data: Category[] | null;
  error: ApiError | null;
}> {
  return apiCall<Category[]>(backendClient.get("/categories"));
}

/** Create a new category. Slug and order are assigned server-side. */
export async function createCategory(
  payload: CreateCategoryPayload
): Promise<{ data: CategoryMutationResult | null; error: ApiError | null }> {
  return apiCall<CategoryMutationResult>(
    backendClient.post("/categories", payload)
  );
}

/** Update a category by ID. */
export async function updateCategory(
  id: string,
  payload: UpdateCategoryPayload
): Promise<{ data: CategoryMutationResult | null; error: ApiError | null }> {
  return apiCall<CategoryMutationResult>(
    backendClient.put(`/categories/${id}`, payload)
  );
}

/** Soft-delete (deactivate) a category by ID. */
export async function deleteCategory(
  id: string
): Promise<{ data: CategoryMutationResult | null; error: ApiError | null }> {
  return apiCall<CategoryMutationResult>(
    backendClient.delete(`/categories/${id}`)
  );
}

/** Upload a category banner image (4:3). Returns its hosted URL. */
export async function uploadCategoryBanner(
  file: File
): Promise<{ data: { url: string } | null; error: ApiError | null }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiCall<{ url: string }>(
    backendClient.post("/categories/banner", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}
