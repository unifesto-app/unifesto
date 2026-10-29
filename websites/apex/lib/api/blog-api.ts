/**
 * Blog API — admin management of the public Markdown blog.
 * Backed by the NestJS `/blog` controller; public list/detail are open, the
 * CRUD + cover upload routes are ADMIN-guarded.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type BlogStatus = "DRAFT" | "PUBLISHED";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  coverImageUrl: string | null;
  readMinutes: number | null;
  featured: boolean;
  status: BlogStatus;
  publishedAt: string | null;
  /** A DRAFT with this set goes live on its own then (K3). */
  scheduledFor: string | null;
  /** Old addresses that redirect here (K3). */
  previousSlugs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BlogInput {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  coverImageUrl?: string;
  readMinutes?: number;
  featured?: boolean;
  status?: BlogStatus;
  scheduledFor?: string | null;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

/** `GET /blog/admin` — every post, any status. */
export async function getAllPosts(): Result<BlogPost[]> {
  return apiCall<BlogPost[]>(backendClient.get("/blog/admin"));
}

/** `POST /blog`. */
export async function createPost(input: BlogInput): Result<BlogPost> {
  return apiCall<BlogPost>(backendClient.post("/blog", input));
}

/** `PATCH /blog/:id`. */
export async function updatePost(
  id: string,
  input: Partial<BlogInput>
): Result<BlogPost> {
  return apiCall<BlogPost>(backendClient.patch(`/blog/${id}`, input));
}

/** `DELETE /blog/:id`. */
export async function deletePost(id: string): Result<{ deleted: boolean }> {
  return apiCall<{ deleted: boolean }>(backendClient.delete(`/blog/${id}`));
}

/** `POST /blog/cover` — upload a cover image, returns `{ url }`. */
export async function uploadBlogCover(file: File): Result<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiCall<{ url: string }>(
    backendClient.post("/blog/cover", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

// ── Auto-blog queue ────────────────────────────────────────────────────

export type BlogQuestionStatus = "QUEUED" | "WRITING" | "PUBLISHED" | "FAILED";

export interface BlogQuestion {
  id: string;
  question: string;
  topic: string;
  intent: string;
  angle: string | null;
  appLink: string | null;
  status: BlogQuestionStatus;
  source: "SEED" | "REFILL" | "SEARCH_CONSOLE";
  failReason: string | null;
  post: { slug: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /blog/questions` — the whole queue, oldest first. */
export async function getBlogQuestions(): Result<BlogQuestion[]> {
  return apiCall<BlogQuestion[]>(backendClient.get("/blog/questions"));
}

/** `POST /blog/questions/:id/retry` — put a FAILED question back in the queue. */
export async function retryBlogQuestion(id: string): Result<BlogQuestion> {
  return apiCall<BlogQuestion>(backendClient.post(`/blog/questions/${id}/retry`));
}

/** `POST /blog/questions/search-console` — queue 10 questions from a Pages CSV. */
export async function learnFromSearchConsole(
  csv: string
): Result<{ added: number; pages: { slug: string; clicks: number }[] }> {
  return apiCall(backendClient.post("/blog/questions/search-console", { csv }));
}
