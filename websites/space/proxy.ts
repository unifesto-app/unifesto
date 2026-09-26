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
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
  "Content-Security-Policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
};

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

const getClientIp = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
};

const isRateLimited = (key: string) => {
  const now = Date.now();
  const store = getRateLimitStore();
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

export function proxy(request: NextRequest) {
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
  const isAuthenticated = isTokenLive(token);

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
  matcher: ["/dashboard/:path*", "/sponsor/:path*", "/login"],
};
