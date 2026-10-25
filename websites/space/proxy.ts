import { NextRequest, NextResponse } from "next/server";

/**
 * Space proxy (Next 16 Middleware → Proxy) — space.unifesto.app
 *
 * Auth is a NestJS JWT in the shared `unifesto_token` cookie (see
 * lib/utils/auth.ts). This proxy does a lightweight gate + security headers +
 * auth-route rate limiting. Fine-grained surface resolution (which spaces, what
 * role) happens client-side in SessionContext and is enforced by the backend on
 * every call.
 *
 * Unlike the older Apex gate, we do NOT trust bare cookie *presence*: a token
 * that is structurally invalid or past its `exp` is treated as unauthenticated.
 * That closes the stale-cookie loop where an expired session still looked signed
 * in and bounced /login → / → /login forever. (Signature verification with the
 * shared secret is a stronger follow-up; the backend remains the authority.)
 */

const TOKEN_COOKIE = "unifesto_token";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 40;
const PROTECTED_PREFIXES = ["/dashboard", "/sponsor"];

type RateLimitEntry = { count: number; resetAt: number };
type RateLimitStore = Map<string, RateLimitEntry>;

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Camera + mic for this origin only: hosts go live from /dashboard/sessions
  // and the check-in scanner reads QR codes (B18). Still off for any embed.
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), usb=()",
};

/**
 * J17: operator JWTs are JS-readable, so only scripts this app served may run.
 * Each request gets a nonce; Next stamps it on its own scripts (it reads the
 * request's CSP header) and the root layout on the theme script. 'strict-dynamic'
 * lets those scripts load others (Razorpay, Maps, Sentry) without a host list.
 * Pages must render per request for this, which the layout's headers() forces.
 */
const contentSecurityPolicy = (nonce: string) =>
  [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"
    }`,
    "worker-src 'self' blob:",
  ].join("; ");

/**
 * Decode a JWT payload (no signature check — Edge-safe, dependency-free) and
 * decide whether it is a usable session: well-formed, carries a subject, and is
 * not expired. Returns false for garbage or expired tokens so the gate treats
 * them as signed-out instead of trusting mere cookie presence.
 */
function isTokenLive(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const json = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      typeof atob === "function"
        ? atob(json)
        : Buffer.from(json, "base64").toString("utf8")
    ) as { exp?: number; userId?: string; sub?: string };

    if (!payload.userId && !payload.sub) return false;
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const getRateLimitStore = (): RateLimitStore => {
  const g = globalThis as typeof globalThis & {
    __spaceRateStore?: RateLimitStore;
  };
  if (!g.__spaceRateStore) g.__spaceRateStore = new Map();
  return g.__spaceRateStore;
};

// J17: Caddy overwrites X-Forwarded-For with the one visitor IP it resolved
// from Cf-Connecting-Ip (trusted only from Cloudflare ranges), so the last
// entry is ours; anything to its left could be client-supplied.
const getClientIp = (request: NextRequest) =>
  request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";

const isRateLimited = (key: string) => {
  const now = Date.now();
  const store = getRateLimitStore();
  // Prune expired windows so one-off IPs don't pile up forever.
  if (store.size > 1000) {
    for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
  }
  const existing = store.get(key);
  if (!existing || now > existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  store.set(key, existing);
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
};

const withSecurityHeaders = (response: NextResponse, csp: string) => {
  Object.entries(securityHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  response.headers.set("Content-Security-Policy", csp);
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  return response;
};

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  if (pathname === "/login") {
    const clientIp = getClientIp(request);
    if (isRateLimited(`${pathname}:${clientIp}`)) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            error:
              "Too many authentication attempts. Please try again in a minute.",
          },
          { status: 429 }
        ),
        csp
      );
    }
  }

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const isAuthenticated = isTokenLive(token);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(loginUrl), csp);
  }

  if (pathname === "/login" && isAuthenticated) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", request.url)), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    csp
  );
}

export const config = {
  // Every page needs its CSP nonce; static files don't.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
