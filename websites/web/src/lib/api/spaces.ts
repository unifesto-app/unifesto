import { apiBase, withInternal } from "@/lib/api/internal";
import type { Branding } from "@/components/BrandedChrome";
// Universal module (no browser APIs): usable from both Client Components and
// server code such as `generateMetadata` / the OG image routes. Do not add a
// "use client" directive here or server-side callers will break.
import { mapEvent, UnavailableError } from "./events";

// Call the NestJS backend directly. The backend exposes spaces under `/spaces`.
// See backends/unifesto-backend/src/spaces/spaces.controller.ts.
const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");

export interface Space {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  parent_space_id?: string;
  super_admin_id?: string;
  depth_level: number;
  logo_url?: string;
  banner_url?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
  /** Events the space has run or is running (K1: empty spaces sink). */
  event_count?: number;
  sub_space_count?: number;
  organisers?: SpaceMember[];
  /**
   * White-label theme, or null for the default Unifesto look. The backend
   * gates it (switched on + plan perk + not suspended).
   */
  branding?: Branding | null;
  /** List payloads: the white-label domain this space's canonical points at (K2). */
  custom_domain?: string | null;
}

export interface SpaceMember {
  id: string;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  role: {
    id: string;
    code: string;
    name: string;
    scope: string;
  };
}

export interface SpaceListResponse {
  spaces: Space[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Fetch with timeout for better UX
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, withInternal({
      ...options,
      signal: controller.signal,
    }));
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Normalize a raw backend Space (Prisma camelCase) into the frontend Space
 * shape (snake_case). The backend response shape is defined in
 * backends/unifesto-backend/src/spaces/spaces.service.ts.
 */
function mapSpace(raw: Record<string, unknown> | null | undefined): Space | null {
  if (!raw) return null;
  const r = raw as Record<string, unknown>;
  const count = (r._count ?? {}) as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    type: (r.type as string) ?? 'REGULAR',
    description: r.description as string | undefined,
    parent_space_id: (r.parentSpaceId ?? r.parent_space_id) as string | undefined,
    super_admin_id: (r.createdBy ?? r.created_by) as string | undefined,
    depth_level: (r.parentSpaceId ?? r.parent_space_id) ? 1 : 0,
    logo_url: (r.logoUrl ?? r.logo_url) as string | undefined,
    banner_url: (r.bannerUrl ?? r.banner_url) as string | undefined,
    website: (r.websiteUrl ?? r.website) as string | undefined,
    city: r.city as string | undefined,
    state: r.state as string | undefined,
    country: r.country as string | undefined,
    is_verified: Boolean(r.verifiedAt),
    is_active: ['APPROVED', 'ACTIVE'].includes(r.status as string),
    created_at: (r.createdAt ?? r.created_at) as string,
    updated_at: (r.updatedAt ?? r.updated_at) as string,
    member_count: (count.userRoles ?? count.members) as number | undefined,
    event_count: count.events as number | undefined,
    sub_space_count: (count.childSpaces ?? count.children) as number | undefined,
    organisers: (r.organisers as SpaceMember[] | undefined) ?? undefined,
    branding: (r.branding ?? null) as Space["branding"],
    custom_domain: (r.customDomain ?? null) as string | null,
  };
}

/**
 * Get all spaces with pagination and filters
 */
export async function getSpaces(
  page: number = 1,
  limit: number = 50,
  filters?: {
    search?: string;
    type?: string;
  }
): Promise<SpaceListResponse> {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    // The backend lists only live (APPROVED or ACTIVE) public spaces by default; `type` is client-side.
    if (filters?.search) {
      params.append('search', filters.search);
    }

    const response = await fetchWithTimeout(`${API_URL}/spaces?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!response.ok) {
      console.error('[API] Error fetching spaces:', response.status, response.statusText);
      return { spaces: [], total: 0, page: 1, limit: 50 };
    }

    const data = await response.json();
    const list = (data?.spaces ?? []) as Record<string, unknown>[];
    const pagination = (data?.pagination ?? {}) as Record<string, unknown>;
    return {
      spaces: list.map((s) => mapSpace(s)!).filter(Boolean),
      total: (pagination.total as number) ?? list.length,
      page: (pagination.page as number) ?? page,
      limit: (pagination.limit as number) ?? limit,
    };
  } catch (error) {
    console.error('[API] Error fetching spaces:', error);
    return { spaces: [], total: 0, page: 1, limit: 50 };
  }
}

/** Every listed space, page by page (the API caps a page at 50). */
export async function getAllSpaces(): Promise<Space[]> {
  const all: Space[] = [];
  // ponytail: 40 pages = 2,000 spaces; search server-side before that.
  for (let page = 1; page <= 40; page++) {
    const { spaces, total } = await getSpaces(page, 50);
    all.push(...spaces);
    if (!spaces.length || all.length >= total) break;
  }
  return all;
}

/**
 * Get space by ID
 */
export async function getSpaceById(id: string): Promise<Space | null> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/spaces/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!response.ok) {
      console.error('[API] Error fetching space:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    // Backend returns the space object unwrapped.
    return mapSpace(data?.id ? data : null);
  } catch (error) {
    console.error('[API] Error fetching space:', error);
    return null;
  }
}

/**
 * Get space by slug
 */
export async function getSpaceBySlug(slug: string): Promise<Space | null> {
    const response = await fetchWithTimeout(`${API_URL}/spaces/slug/${encodeURIComponent(slug)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    // Only a 404 means "no such space"; other failures throw (see getEventBySlug).
    if (response.status === 404) return null;
    if (response.status === 403) throw new UnavailableError();
    if (!response.ok) {
      throw new Error(`Error fetching space: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Backend returns the space object unwrapped.
    return mapSpace(data?.id ? data : null);
}

/**
 * Get sub-spaces of a parent space
 */
export async function getSubSpaces(parentId: string): Promise<Space[]> {
  try {
    const params = new URLSearchParams({ parentId, page: '1', limit: '50' });
    const response = await fetchWithTimeout(`${API_URL}/spaces?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!response.ok) {
      console.error('[API] Error fetching sub-spaces:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const list = (data?.spaces ?? []) as Record<string, unknown>[];
    return list.map((s) => mapSpace(s)!).filter(Boolean);
  } catch (error) {
    console.error('[API] Error fetching sub-spaces:', error);
    return [];
  }
}

/**
 * Get events by space
 */
export async function getSpaceEvents(spaceId: string, page: number = 1, limit: number = 20) {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      // Past events too: the space page shows them as "Past events".
      when: 'all',
    });

    const response = await fetchWithTimeout(`${API_URL}/events/space/${encodeURIComponent(spaceId)}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!response.ok) {
      console.error('[API] Error fetching space events:', response.status, response.statusText);
      return { events: [], total: 0, page: 1, limit: 20 };
    }

    const data = await response.json();
    const list = (data?.data ?? []) as Record<string, unknown>[];
    return {
      events: list.map((e) => mapEvent(e)!).filter(Boolean),
      total: (data?.total as number) ?? list.length,
      page: (data?.page as number) ?? page,
      limit: (data?.limit as number) ?? limit,
    };
  } catch (error) {
    console.error('[API] Error fetching space events:', error);
    return { events: [], total: 0, page: 1, limit: 20 };
  }
}

// Constants
export const SPACE_TYPE_LABELS: Record<string, string> = {
  university: 'University',
  college: 'College',
  club: 'Club',
  community: 'Community',
};

export const SPACE_TYPES = [
  { key: 'all', label: 'All Types' },
  { key: 'university', label: 'Universities' },
  { key: 'college', label: 'Colleges' },
  { key: 'club', label: 'Clubs' },
  { key: 'community', label: 'Communities' },
];
