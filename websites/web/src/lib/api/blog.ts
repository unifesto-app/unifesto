import { apiBase, withInternal } from "@/lib/api/internal";
import { IST } from "@/lib/site";
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
  coverAlt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
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

/**
 * One published post by slug, or null on a real 404. Any other failure throws,
 * so the page shows its error state (and ISR keeps the last good copy) instead
 * of telling readers and crawlers the post is gone.
 */
export async function getPost(slug: string): Promise<BlogPost | null> {
  const res = await fetch(`${API_URL}/blog/${encodeURIComponent(slug)}`, withInternal({
    next: { revalidate: 60 },
  }));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error fetching blog post: ${res.status}`);
  return (await res.json()) as BlogPost;
}

/** Human-friendly date + read-time for a post's meta line. */
export function postMeta(post: BlogPost): { date: string; readTime: string } {
  const iso = post.publishedAt ?? post.createdAt;
  const date = new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: IST,
  });
  const readTime = post.readMinutes ? `${post.readMinutes} min read` : "";
  return { date, readTime };
}
