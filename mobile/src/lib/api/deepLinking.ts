/**
 * Deep Linking API
 * Handles conversion of web slugs to mobile app IDs
 */

import { makeOptionalAuthRequest } from './helpers';

/**
 * Get event ID from slug
 */
export async function getEventIdFromSlug(slug: string): Promise<string | null> {
  try {
    const response = await makeOptionalAuthRequest(`/events/${slug}`);
    
    if (!response?.ok) {
      return null;
    }

    const data = await response.json();
    return data?.id || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get space ID from slug
 */
export async function getSpaceIdFromSlug(slug: string): Promise<string | null> {
  try {
    const response = await makeOptionalAuthRequest(`/spaces/slug/${slug}`);
    
    if (!response?.ok) {
      return null;
    }

    const data = await response.json();
    return data?.id || null;
  } catch (error) {
    return null;
  }
}
