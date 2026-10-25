import { NextRequest, NextResponse } from "next/server";

/**
 * Apex proxy (NestJS JWT auth)
 *
 * Auth is handled by the Unifesto NestJS backend. The JWT lives in the
 * `unifesto_token` cookie (see lib/utils/auth.ts). This proxy does a
 * lightweight presence check + security headers + auth-route rate limiting.
 * Fine-grained role checks (admin vs organiser, per-space roles) are resolved
 * client-side by SessionContext and enforced by the backend on every call.
 */

const TOKEN_COOKIE = "unifesto_token";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 40;
const PROTECTED_PREFIXES = ["/dashboard"];

type RateLimitEntry = { count: number; resetAt: number };
type RateLimitStore = Map<string, RateLimitEntry>;

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
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

const getRateLimitStore = (): RateLimitStore => {
  const g = globalThis as typeof globalThis & {
    __apexRateStore?: RateLimitStore;
  };
  if (!g.__apexRateStore) g.__apexRateStore = new Map();
  return g.__apexRateStore;
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

export async function proxy(request: NextRequest) {
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
  const isAuthenticated = Boolean(token);

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
