/**
 * Spaces Placeholder
 * Temporary placeholder until spaces API is implemented
 */

export const ORG_TYPE_LABELS: Record<string, string> = {
  university: 'University',
  college: 'College',
  club: 'Club',
  community: 'Community',
};

export interface Org {
  id: string;
  name: string;
  type: 'university' | 'college' | 'club' | 'community';
  description: string;
  parent_org_id?: string;
  logo_url?: string;
  website?: string;
}

// Placeholder functions - return empty data until API is implemented
export function getAllOrgs(): Org[] {
  return [];
}

export function getOrgById(id: string): Org | undefined {
  return undefined;
}

export function getSubOrgs(parentId: string): Org[] {
  return [];
}

export function getOrgsByType(type: string): Org[] {
  return [];
}

export function getEventsByOrgTree(orgId: string): any[] {
  return [];
}
