/**
 * Certificate API for the website: public verification only, used by the
 * /verify/[code] page. No session is required, so it is a plain fetch usable
 * from the server. An attendee's own certificate list lives in the app.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app";

// ============================================================================
// TYPES
// ============================================================================

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
