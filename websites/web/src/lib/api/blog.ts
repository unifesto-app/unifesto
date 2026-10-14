import { apiBase, withInternal } from "@/lib/api/internal";
/**
 * Blog API — public, read-only. Safe to call from server components (no auth).
 */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

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
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** All published posts, newest first. Returns [] on any failure. */
export async function getPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(`${API_URL}/blog`, withInternal({ next: { revalidate: 60 } }));
    if (!res.ok) return [];
    return (await res.json()) as BlogPost[];
  } catch {
    return [];
  }
}

/** One published post by slug, or null when not found. */
export async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const res = await fetch(`${API_URL}/blog/${encodeURIComponent(slug)}`, withInternal({
      next: { revalidate: 60 },
    }));
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as BlogPost;
  } catch {
    return null;
  }
}

/** Human-friendly date + read-time for a post's meta line. */
export function postMeta(post: BlogPost): { date: string; readTime: string } {
  const iso = post.publishedAt ?? post.createdAt;
  const date = new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const readTime = post.readMinutes ? `${post.readMinutes} min read` : "";
  return { date, readTime };
}
