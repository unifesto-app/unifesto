/**
 * Single source of truth for allowed browser origins (used by the HTTP server
 * in main.ts). Keep new socket gateways on this allowlist rather than
 * `origin: '*'` so the realtime surface can never drift from HTTP.
 *
 * Allows: any `*.unifesto.app` subdomain, the apex domain, and localhost for dev.
 * No-origin requests (native apps, curl, same-origin) are permitted — there is no
 * browser origin to spoof in those cases, and credentialed cross-origin access is
 * still gated by the token check on top of this.
 */
export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  return (
    origin.endsWith('.unifesto.app') ||
    origin === 'https://unifesto.app' ||
    origin.startsWith('http://localhost')
  );
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
