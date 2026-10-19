import { apiBase, withInternal } from "@/lib/api/internal";

/* Versioned legal documents (I2). Public, read-only, safe in server components. */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

export interface LegalDoc {
  slug: string;
  version: number;
  title: string;
  body: string;
  summary: string | null;
  publishedAt: string;
}

/** Latest published version, or null when there is none. Other failures throw,
 *  so a cached page is kept rather than replaced by a 404 while the API is down. */
export async function getLegalDoc(slug: string): Promise<LegalDoc | null> {
  const res = await fetch(`${API_URL}/legal/${encodeURIComponent(slug)}`, withInternal({ next: { revalidate: 300 } }));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`legal/${slug}: ${res.status}`);
  return (await res.json()) as LegalDoc;
}
