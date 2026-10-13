/**
 * Single source of truth for allowed browser origins (used by the HTTP server
 * in main.ts). Keep new socket gateways on this allowlist rather than
 * `origin: '*'` so the realtime surface can never drift from HTTP.
 *
 * Allows: https `unifesto.app` and any https `*.unifesto.app` subdomain, plus
 * exact `http://localhost[:port]` / `127.0.0.1` for dev. Matching is anchored:
 * `http://localhost.evil.com` and plain-http subdomains are refused (S26).
 * No-origin requests (native apps, curl, same-origin) are permitted — there is no
 * browser origin to spoof in those cases, and credentialed cross-origin access is
 * still gated by the token check on top of this.
 */
const PROD_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*unifesto\.app$/;
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  return PROD_ORIGIN.test(origin) || DEV_ORIGIN.test(origin);
}

/**
 * Origin callback in the shape both `cors` (Express) and Socket.IO expect.
 */
export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'), false);
  }
}
