/**
 * Certificates API Client for Mobile App
 *
 * The attendee's own certificates. Backed by the NestJS `/certificates/mine`
 * endpoint (authenticated). Certificate issuance and verification live on the
 * web/organiser surfaces; the app only lists and opens what the user has earned.
 */

import { makeAuthenticatedRequest } from './helpers';

export interface MyCertificate {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  pdfUrl: string | null;
  imageUrl: string | null;
  issuedAt: string;
  event: {
    id: string;
    title: string;
    slug: string;
  };
}

/**
 * The signed-in attendee's certificates across every event, newest first.
 * Returns [] on any failure so the screen renders an empty state rather than
 * throwing.
 */
export async function getMyCertificates(): Promise<MyCertificate[]> {
  try {
    const response = await makeAuthenticatedRequest('/certificates/mine');
    if (!response?.ok) return [];
    return (await response.json()) as MyCertificate[];
  } catch (error) {
    if (__DEV__) console.warn('[api] Failed to load certificates:', error);
    return [];
  }
}
