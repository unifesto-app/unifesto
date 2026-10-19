/**
 * Spaces API Service
 * Handles all space-related API calls to the backend
 */

import { Branding, Event, PaletteColor } from './events';
import { errorFrom, expectOk, makeAuthenticatedRequest, makeOptionalAuthRequest, makePublicRequest } from './helpers';

/**
 * Runs a request through the shared helpers (offline cache, connectivity,
 * token refresh) and resolves with the parsed body or throws ApiError.
 * `auth: true` for signed-in-only routes; otherwise the stored token is
 * attached when there is one.
 */
async function request<T>(
  path: string,
  failureMessage: string,
  { auth, ...init }: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const response = auth ? await makeAuthenticatedRequest(path, init) : await makeOptionalAuthRequest(path, init);
  return expectOk<T>(response, failureMessage);
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Space {
  id: string;
  name: string;
  /** Set when a platform admin confirmed the space is run by (or with the permission of) the organisation it names. */
  verifiedAt?: string | null;
  slug: string;
  description: string | null;
  type?: string | null;
  websiteUrl?: string | null;
  website_url?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
  bannerUrl?: string | null;
  banner_url?: string | null;
  /** Organiser white-label branding, or null for the default Unifesto look. */
  branding?: Branding | null;
  city: string | null;
  state: string | null;
  country: string | null;
  tags?: string[];
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  coCuratorLimit?: number;
  parent_org_id?: string | null;
  parentSpaceId?: string | null;
  parentSpace?: {
    id: string;
    name: string;
    slug: string;
    type?: string | null;
    logoUrl?: string | null;
    logo_url?: string | null;
  } | null;
  member_count?: number;
  event_count?: number;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  _count?: {
    userRoles: number;
    events?: number;
  };
  userRoles?: SpaceMember[];
  organisers?: SpaceMember[];
  /** My role here, flattened by the API (null = not a member). */
  userRole?: { id: string; code: string; name: string } | null;
  /** Public team: Curators and Co-Curators of the space's events. */
  team?: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null; roleCode: string }[];
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
  createdAt: string;
}

export interface SpaceListResponse {
  spaces: Space[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// Public Space APIs (No authentication required)
// ============================================================================

/**
 * Get all public spaces with pagination, search, and filters
 */
export async function getAllSpaces(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  visibility?: string;
  city?: string;
  country?: string;
} = {}): Promise<SpaceListResponse> {
  const queryParams = new URLSearchParams({
    page: (params.page || 1).toString(),
    limit: (params.limit || 20).toString(),
  });

  if (params.search) queryParams.append('search', params.search);
  if (params.status) queryParams.append('status', params.status);
  if (params.visibility) queryParams.append('visibility', params.visibility);
  if (params.city) queryParams.append('city', params.city);
  if (params.country) queryParams.append('country', params.country);

  return request(`/spaces?${queryParams.toString()}`, 'Failed to fetch spaces');
}

/**
 * Get space by ID
 */
export async function getSpaceById(spaceId: string): Promise<Space> {
  return request(`/spaces/${spaceId}`, 'Failed to fetch space');
}

/**
 * Get space by slug
 */
/** Top banner colours by pixel share, most frequent first (space page background). */
export async function getSpacePalette(spaceId: string): Promise<PaletteColor[]> {
  const response = await makeOptionalAuthRequest(`/spaces/${spaceId}/palette`);
  if (!response?.ok) return [];
  const body = await response.json();
  return Array.isArray(body?.colors) ? body.colors : [];
}

export async function getSpaceBySlug(slug: string): Promise<Space> {
  const cleanSlug = slug.replace(/^@/, '');
  return request(`/spaces/slug/${cleanSlug}`, 'Space not found');
}

/**
 * Search spaces
 */
export async function searchSpaces(
  query: string,
  page: number = 1,
  limit: number = 20
): Promise<SpaceListResponse> {
  return getAllSpaces({ page, limit, search: query, visibility: 'PUBLIC', status: 'ACTIVE' });
}

// ============================================================================
// Authenticated Space APIs (signed-in only)
// ============================================================================

/**
 * Get user's space memberships (authenticated)
 */
export async function getUserSpaces(): Promise<Space[]> {
  return request('/users/me/spaces', 'Failed to fetch user spaces', { auth: true });
}

/**
 * Get spaces where the current user is a Space Admin.
 * GET /users/me/spaces?role=organiser
 */
export async function getMyOrganiserSpaces(): Promise<Space[]> {
  const response = await makeAuthenticatedRequest('/users/me/spaces?role=organiser');
  if (!response?.ok) {
    throw new Error('Failed to fetch organiser spaces');
  }
  const data = await response.json();
  // Backend may return an array or { spaces: [] }
  return Array.isArray(data) ? data : (data.spaces || []);
}

/**
 * Get space's events
 */
export async function getSpaceEvents(
  spaceId: string,
  page: number = 1,
  limit: number = 20,
  /** Also list finished events (the space page's "Past" section). */
  includePast = false,
): Promise<{ events: any[]; pagination: any }> {
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (includePast) queryParams.set('when', 'all');

  const result = await request<any>(
    `/events/space/${spaceId}?${queryParams.toString()}`,
    'Failed to fetch space events',
  );
  return { events: result.data || result.events || [], pagination: result.pagination || {} };
}

/**
 * Get sub-spaces of a parent space
 */
export async function getSubSpaces(parentId: string): Promise<{ spaces: Space[] }> {
  const data = await request<SpaceListResponse>(`/spaces?parentId=${parentId}`, 'Failed to fetch sub-spaces');
  return { spaces: data.spaces };
}

/**
 * Join a space (authenticated)
 */
export async function joinSpace(spaceId: string): Promise<{ message: string; membership: any }> {
  return request(`/spaces/${spaceId}/join`, 'Failed to join space', { auth: true, method: 'POST' });
}

/**
 * Leave a space (authenticated)
 */
export async function leaveSpace(spaceId: string): Promise<{ message: string }> {
  return request(`/spaces/${spaceId}/leave`, 'Failed to leave space', { auth: true, method: 'POST' });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format space slug for display (add @ prefix)
 */
export function formatSpaceSlug(slug: string): string {
  return slug.startsWith('@') ? slug : `@${slug}`;
}

/**
 * Get space visibility badge color
 */
export function getVisibilityColor(visibility: string): string {
  return visibility === 'PUBLIC' ? '#10b981' : '#8b5cf6';
}

/**
 * Get space status badge color
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: '#f59e0b',
    APPROVED: '#3b82f6',
    REJECTED: '#ef4444',
    ACTIVE: '#10b981',
    INACTIVE: '#6b7280',
    SUSPENDED: '#f97316',
    ARCHIVED: '#64748b',
  };
  return colors[status] || '#6b7280';
}

/**
 * Check if space is accessible (public or user is member)
 */
export function isSpaceAccessible(space: Space, userSpaces?: Space[]): boolean {
  if (space.visibility === 'PUBLIC' && space.status === 'ACTIVE') {
    return true;
  }
  
  if (userSpaces) {
    return userSpaces.some(s => s.id === space.id);
  }
  
  return false;
}



export interface SpaceRequest {
  id: string;
  name: string;
  description: string | null;
  type: string;
  visibility: string;
  city: string | null;
  state: string | null;
  tags: string[];
  websiteUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  createdAt: string;
}

export const createSpaceRequest = async (data: {
  name: string;
  description?: string;
  type?: string;
  visibility?: string;
  city?: string;
  state?: string;
  tags?: string[];
  websiteUrl?: string;
  requesterRole?: string;
  authorityConfirmed?: boolean;
}): Promise<SpaceRequest> => {
  const response = await makeAuthenticatedRequest('/spaces/request', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response?.ok) throw await errorFrom(response, 'Failed to submit request');
  return response.json();
};

export const getMySpaceRequests = async (): Promise<SpaceRequest[]> => {
  const response = await makeAuthenticatedRequest('/spaces/my-requests');
  if (!response?.ok) return [];
  const text = await response.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
};

/** D7: ask to host one event without a space. Followed in My help as a case. */
export const createEventRequest = async (data: {
  title: string;
  description?: string;
  type: 'IN_PERSON' | 'ONLINE';
  startDateTime: string;
  endDateTime: string;
  city?: string;
}): Promise<{ id: string }> => {
  const response = await makeAuthenticatedRequest('/spaces/event-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response?.ok) throw await errorFrom(response, 'Failed to send request');
  return response.json();
};
