import { apiBase, withInternal } from "@/lib/api/internal";

/** Careers API: public, read-only. Safe to call from server components. */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

export interface Career {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  experience_level: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  salary_range?: string;
  status: string;
  created_at: string;
}

/** Open roles, newest first. Returns [] on any failure. */
export async function getOpenRoles(): Promise<Career[]> {
  try {
    const res = await fetch(`${API_URL}/careers`, withInternal({ next: { revalidate: 300 } }));
    if (!res.ok) return [];
    return ((await res.json()).data ?? []) as Career[];
  } catch {
    return [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One open role, or null when it doesn't exist or is closed; other failures throw. */
export async function getRole(id: string): Promise<Career | null> {
  if (!UUID.test(id)) return null;
  const res = await fetch(`${API_URL}/careers/${encodeURIComponent(id)}`, withInternal({ next: { revalidate: 300 } }));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error fetching role: ${res.status}`);
  return ((await res.json()).data ?? null) as Career | null;
}
