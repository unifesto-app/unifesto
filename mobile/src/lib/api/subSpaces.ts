import { call } from './manageEvent';

/*
 * A SUPER space's roll-up of everything beneath it (sub-spaces at any depth):
 * members, events, registrations and revenue, plus one row per sub-space.
 */

export interface SubSpaceRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  parentSpaceId: string | null;
  depth: number;
  members: number;
  events: number;
  upcomingEvents: number;
  registrations: number;
  revenue: number;
}

export interface SubSpaceAnalytics {
  totals: { subSpaces: number; maxDepth: number; members: number; events: number; upcomingEvents: number; registrations: number; revenue: number };
  subSpaces: SubSpaceRow[];
}

export const getSubSpaceAnalytics = (spaceId: string) => call<SubSpaceAnalytics>(`/spaces/${spaceId}/analytics`);

/** Depth-first order (parent, then its children, alphabetical) for an indented list. */
export function treeOrder(rows: SubSpaceRow[]): SubSpaceRow[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, SubSpaceRow[]>();
  for (const r of rows) {
    const key = r.parentSpaceId && ids.has(r.parentSpaceId) ? r.parentSpaceId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const out: SubSpaceRow[] = [];
  const walk = (key: string | null) => {
    for (const r of byParent.get(key) ?? []) {
      out.push(r);
      walk(r.id);
    }
  };
  walk(null);
  return out;
}
