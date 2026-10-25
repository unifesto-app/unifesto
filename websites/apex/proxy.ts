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
  "Content-Security-Policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
};

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

const withSecurityHeaders = (response: NextResponse) => {
  Object.entries(securityHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
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
        )
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
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (pathname === "/login" && isAuthenticated) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", request.url)));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
