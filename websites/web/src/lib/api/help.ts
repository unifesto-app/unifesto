import { apiBase, withInternal } from "@/lib/api/internal";
/**
 * Help articles API (D17): public, read-only. Safe to call from server components.
 */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

/** Index rows come without the body. */
export interface HelpArticleSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  updatedAt: string;
}

export interface HelpArticle extends HelpArticleSummary {
  body: string;
}

/** All published articles, sorted by category then title. Returns [] on any failure. */
export async function getHelpArticles(): Promise<HelpArticleSummary[]> {
  try {
    const res = await fetch(`${API_URL}/help`, withInternal({ next: { revalidate: 60 } }));
    if (!res.ok) return [];
    return (await res.json()) as HelpArticleSummary[];
  } catch {
    return [];
  }
}

/** One published article by slug, or null on a real 404; other failures throw (see getPost). */
export async function getHelpArticle(slug: string): Promise<HelpArticle | null> {
  const res = await fetch(
    `${API_URL}/help/${encodeURIComponent(slug)}`,
    withInternal({ next: { revalidate: 60 } }),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error fetching help article: ${res.status}`);
  return (await res.json()) as HelpArticle;
}
