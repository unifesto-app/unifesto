import { apiBase, withInternal } from "@/lib/api/internal";
import type { OrbitCity } from "@/components/visuals/OrbitIndiaMap";

/* Unifesto Orbit public map data. Aggregate counts only (the backend folds
   colleges under 3 applications into "Other colleges"). Safe in server components. */

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app");

export interface OrbitMapData {
  totals: { applications: number; cities: number; colleges: number };
  cities: OrbitCity[];
}

/** The map, or null when the API can't be reached; the page then hides the section. */
export async function getOrbitMap(): Promise<OrbitMapData | null> {
  try {
    const res = await fetch(`${API_URL}/orbit/application-map`, withInternal({ next: { revalidate: 300 } }));
    return res.ok ? ((await res.json()) as OrbitMapData) : null;
  } catch {
    return null;
  }
}
