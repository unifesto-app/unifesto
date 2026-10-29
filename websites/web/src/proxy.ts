import { withInternal } from '@/lib/api/internal';
import { NextResponse } from 'next/server';
import { isOwnHost } from '@/lib/own-host';
import type { NextRequest } from 'next/server';

const MAIN = 'https://www.unifesto.app';
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.unifesto.app';

// host -> space slug (null = not a live custom domain), kept for a minute so a
// page load doesn't ask the API on every request.
// ponytail: per-process cache; a suspension or removal takes up to 60s to bite.
const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
};

/**
 * K14: strict CSP. Scripts run only with this request's nonce (Next stamps it
 * on its own scripts and inline runtime; the root layout on the theme script)
 * or when loaded by such a script ('strict-dynamic', which covers Razorpay's
 * checkout.js and what it pulls in). Hosts in script-src are the fallback for
 * browsers without CSP3. Styles stay 'unsafe-inline': React style attributes
 * need it, and a style can't read localStorage.
 */
function csp(nonce: string, isConsole: boolean): string {
  const dev = process.env.NODE_ENV === 'development';
  const razorpay = 'https://checkout.razorpay.com https://api.razorpay.com';
  const api = origin(process.env.NEXT_PUBLIC_API_URL) || 'https://api.unifesto.app';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Event banners, space logos and avatars come from S3 and elsewhere.
    "img-src 'self' data: blob: https:",
    [
      "connect-src 'self'",
      api,
      origin(process.env.NEXT_PUBLIC_SENTRY_DSN),
      'https://api.bigdatacloud.net', // events near me (EventsGrid)
      'https://lumberjack.razorpay.com',
      razorpay,
      // Console only: socket.io to the API (projector, live updates), LiveKit
      // Cloud for live sessions, and Google Maps + Places for venue search.
      isConsole ? `${api.replace(/^http/, 'ws')} wss://*.livekit.cloud https://*.livekit.cloud` : '',
      isConsole ? 'https://*.googleapis.com https://*.gstatic.com https://*.google.com' : '',
      dev ? 'ws:' : '',
    ].filter(Boolean).join(' '),
    `frame-src ${razorpay} https://maps.google.com https://www.google.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/* The console (/console/**, Track V). One sign-in (V8): web's /login and its
   session. The proxy can't see that session's refresh cookie (uf_rt is scoped
   to /auth), so it lets through its `uf_in` hint, or a live `unifesto_token`
   from the old space app until those expire. A light gate: the backend stays
   the authority. No-access handles signed-out visitors itself, and the
   projector signs in with its display link. */
const HINT_COOKIE = 'uf_in';
const LEGACY_TOKEN_COOKIE = 'unifesto_token';
const CONSOLE_PUBLIC = ['/console/no-access', '/console/present'];
const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

/** Well-formed, has a subject and isn't past `exp`. No signature check (Edge-safe). */
function isTokenLive(token: string | undefined): boolean {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number; userId?: string; sub?: string };
    if (!payload.userId && !payload.sub) return false;
    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function consoleGate(request: NextRequest, reqHeaders: Headers): NextResponse {
  const { pathname, search } = request.nextUrl;
  const signedIn =
    request.cookies.get(HINT_COOKIE)?.value === '1' || isTokenLive(request.cookies.get(LEGACY_TOKEN_COOKIE)?.value);
  if (!signedIn && !CONSOLE_PUBLIC.some((p) => under(pathname, p))) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next({ request: { headers: reqHeaders } });
}

const tenants = new Map<string, { slug: string | null; until: number }>();

async function tenantSlug(host: string): Promise<string | null> {
  const hit = tenants.get(host);
  if (hit && hit.until > Date.now()) return hit.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(`${API}/white-label/domains/resolve?host=${encodeURIComponent(host)}`, withInternal());
    if (res.ok) {
      const body = await res.json();
      slug = (body.data ?? body).spaceSlug ?? null;
    } else if (res.status !== 404) {
      return hit?.slug ?? null; // API trouble: keep serving the last answer
    }
  } catch {
    return hit?.slug ?? null;
  }
  tenants.set(host, { slug, until: Date.now() + 60_000 });
  return slug;
}

/**
 * 1. .well-known paths pass untouched (App/Universal Links need a plain 200).
 * 2. unifesto.app → www.unifesto.app.
 * 3. On our own hosts, /console/** goes through the console gate.
 * 4. A space's custom domain serves only that space: `/` is its space page,
 *    `/event/*` its events (the page 404s other spaces' events), its sign-in
 *    session routes and static files pass, and every other path goes to the
 *    main site.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = csp(nonce, under(request.nextUrl.pathname, '/console'));
  // Next reads the nonce from the request's CSP header while rendering.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const res = await route(request, headers);
  res.headers.set('Content-Security-Policy', policy);
  return res;
}

async function route(request: NextRequest, reqHeaders: Headers): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  // Standalone Next reports its bind address (0.0.0.0) in nextUrl, not the
  // visitor's host; Caddy passes the real one through in Host.
  const hostname = (request.headers.get('host') ?? request.nextUrl.hostname).toLowerCase().replace(/:\d+$/, '');

  if (pathname.startsWith('/.well-known/')) return NextResponse.next({ request: { headers: reqHeaders } });

  if (hostname === 'unifesto.app') return NextResponse.redirect(`${MAIN}${pathname}${search}`, 308);

  if (isOwnHost(hostname)) {
    // Only this proxy may set the tenant headers; drop any a client sent.
    reqHeaders.delete('x-tenant-host');
    reqHeaders.delete('x-tenant-space');
    if (under(pathname, '/console')) return consoleGate(request, reqHeaders);
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  const slug = await tenantSlug(hostname);
  if (!slug) return new NextResponse('Not found', { status: 404 });

  const headers = reqHeaders;
  headers.set('x-tenant-host', hostname);
  headers.set('x-tenant-space', slug);

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = `/space/${slug}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (pathname === `/space/${slug}`) return NextResponse.redirect(`https://${hostname}/`, 308);
  // Its own robots.txt and sitemap, not Unifesto's (src/app/(public)/space/[spaceSlug]/).
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    const url = request.nextUrl.clone();
    url.pathname = `/space/${slug}${pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (
    pathname.startsWith('/event/') ||
    // K18: the email-code session (host-only cookie on this domain). Google
    // sign-in stays on our own hosts: Cognito can't list every client domain.
    pathname === '/auth/session' ||
    pathname === '/auth/logout' ||
    pathname.startsWith(`/space/${slug}/`) || // its OG image
    pathname.startsWith('/public/') ||
    /\.[a-z0-9]+$/i.test(pathname) // files from /public
  ) {
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.redirect(`${MAIN}${pathname}${search}`, 307);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
