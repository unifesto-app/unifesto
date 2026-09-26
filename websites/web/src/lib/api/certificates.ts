/**
 * Certificate API functions.
 *
 * Two very different callers:
 *   - getMyCertificates(): authenticated, the signed-in attendee's own list.
 *   - verifyCertificate():  PUBLIC, used by the /verify/[code] page. No session
 *     is required, so it is a plain fetch usable from the server.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app";

/** Auth headers from the current Supabase session (client-side only). */
async function getAuthHeaders(): Promise<HeadersInit> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("No active session");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

// ============================================================================
// TYPES
// ============================================================================

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

export interface CertificateVerification {
  /** True only when status is ISSUED (a revoked certificate resolves but is invalid). */
  valid: boolean;
  status: "ISSUED" | "REVOKED";
  certificateNumber: string;
  recipientName: string;
  eventTitle: string;
  eventDate: string;
  issuer: string;
  issuedAt: string;
  revokedAt: string | null;
  imageUrl: string | null;
  pdfUrl: string | null;
}

// ============================================================================
// AUTHENTICATED
// ============================================================================

/** The signed-in attendee's certificates across every event. */
export async function getMyCertificates(): Promise<MyCertificate[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/certificates/mine`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to load certificates");
  }

  return response.json();
}

// ============================================================================
// PUBLIC
// ============================================================================

/**
 * Verify a certificate by its public code. Safe to call from a server
 * component — no auth. Returns null when the code doesn't resolve (404), so the
 * page can render a clean "not found" instead of throwing.
 */
export async function verifyCertificate(
  code: string
): Promise<CertificateVerification | null> {
  const response = await fetch(
    `${API_URL}/certificates/verify/${encodeURIComponent(code)}`,
    { method: "GET", cache: "no-store" }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Verification failed with status ${response.status}`);
  }

  return response.json();
}
