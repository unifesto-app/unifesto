import { call } from './manageEvent';
import { uploadImage } from './upload';

/*
 * The space's public profile, as Space Admins edit it (space:manage-settings).
 * The backend returns a mix of snake_case and camelCase keys, so reads go
 * through `toProfile` and the screen only ever sees one shape.
 */

export type SpaceVisibility = 'PUBLIC' | 'PRIVATE';

export interface SpaceProfile {
  id: string;
  name: string;
  slug: string;
  description: string;
  websiteUrl: string;
  city: string;
  state: string;
  tags: string[];
  visibility: SpaceVisibility;
  logoUrl: string | null;
  bannerUrl: string | null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function toProfile(r: Raw): SpaceProfile {
  return {
    id: str(r.id),
    name: str(r.name),
    slug: str(r.slug),
    description: str(r.description),
    websiteUrl: str(r.websiteUrl ?? r.website_url ?? r.website),
    city: str(r.city),
    state: str(r.state),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    visibility: r.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
    logoUrl: ((r.logoUrl ?? r.logo_url) as string | null) ?? null,
    bannerUrl: ((r.bannerUrl ?? r.banner_url) as string | null) ?? null,
  };
}

export async function getSpaceProfile(spaceId: string) {
  const res = await call<Raw>(`/spaces/${spaceId}`);
  return res.ok ? { ok: true as const, data: toProfile(res.data) } : res;
}

export type SpaceProfilePatch = Omit<SpaceProfile, 'id' | 'logoUrl' | 'bannerUrl'>;

export async function updateSpaceProfile(spaceId: string, patch: SpaceProfilePatch) {
  const res = await call<Raw>(`/spaces/${spaceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, country: 'India' }),
  });
  return res.ok ? { ok: true as const, data: toProfile(res.data) } : res;
}

/** Square logo, 2 MB cap. */
export const uploadSpaceLogo = (spaceId: string, uri: string) =>
  uploadImage<{ logoUrl: string }>(`/spaces/${spaceId}/logo`, 'logo', uri);

/** 4:3 banner, 5 MB cap. */
export const uploadSpaceBanner = (spaceId: string, uri: string) =>
  uploadImage<{ bannerUrl: string }>(`/spaces/${spaceId}/banner`, 'banner', uri);
