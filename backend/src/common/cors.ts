import { ForbiddenException } from '@nestjs/common';

/**
 * Single source of truth for allowed browser origins (used by the HTTP server
 * in main.ts). Keep new socket gateways on this allowlist rather than
 * `origin: '*'` so the realtime surface can never drift from HTTP.
 *
 * Allows: https `unifesto.app` and any https `*.unifesto.app` subdomain,
 * https `wegobeyond.in` (+ www; its crew form posts here), plus exact
 * `http://localhost[:port]` / `127.0.0.1` for dev. Matching is anchored:
 * `http://localhost.evil.com` and plain-http subdomains are refused (S26).
 * No-origin requests (native apps, curl, same-origin) are permitted — there is no
 * browser origin to spoof in those cases, and credentialed cross-origin access is
 * still gated by the token check on top of this.
 */
const PROD_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*unifesto\.app$/;
const WEGOBEYOND_ORIGIN = /^https:\/\/(www\.)?wegobeyond\.in$/;
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  return (
    PROD_ORIGIN.test(origin) ||
    WEGOBEYOND_ORIGIN.test(origin) ||
    DEV_ORIGIN.test(origin)
  );
}

type OriginCallback = (err: Error | null, allow?: boolean) => void;

/**
 * The refusal for a browser origin we don't serve: a 403, which the global
 * filter neither logs as an error nor sends to Sentry. A plain Error became a
 * 500 and a Sentry issue for every request any other site's browser made.
 * Still a refusal: the request never reaches a handler.
 */
export const corsRefusal = () =>
  new ForbiddenException("This site can't call the Unifesto API from a browser. Call it from your server.");

/**
 * Origin callback in the shape both `cors` (Express) and Socket.IO expect.
 */
export function corsOriginCallback(origin: string | undefined, callback: OriginCallback): void {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    callback(corsRefusal(), false);
  }
}

/**
 * The HTTP server's origin check (main.ts): the allowlist, then a space's live
 * custom web domain (H25: its "Notify me" and inquiry forms post here). Never
 * an arbitrary reflected origin. A failed domain lookup refuses rather than
 * leaving the request waiting forever.
 */
export function httpCorsOrigin(isCustomDomainOrigin: (origin: string) => Promise<boolean>, warn: (message: string) => void) {
  return (origin: string | undefined, callback: OriginCallback): void => {
    // No origin: mobile apps, servers, curl. Nothing to refuse.
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    isCustomDomainOrigin(origin).then(
      (ok) => {
        if (ok) return callback(null, true);
        warn(`Blocked CORS request from disallowed origin: ${origin}`);
        callback(corsRefusal(), false);
      },
      () => callback(corsRefusal(), false),
    );
  };
}
