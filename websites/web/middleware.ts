import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAIN = 'https://www.unifesto.app';
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.unifesto.app';

/** Our own hosts; anything else is a space's custom domain. */
const isOwnHost = (h: string) =>
  h === 'unifesto.app' || h.endsWith('.unifesto.app') || h === 'localhost' || /^[\d.]+$/.test(h) || h.endsWith('.localhost');

// host -> space slug (null = not a live custom domain), kept for a minute so a
// page load doesn't ask the API on every request.
// ponytail: per-process cache; a suspension or removal takes up to 60s to bite.
const tenants = new Map<string, { slug: string | null; until: number }>();

async function tenantSlug(host: string): Promise<string | null> {
  const hit = tenants.get(host);
  if (hit && hit.until > Date.now()) return hit.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(`${API}/white-label/domains/resolve?host=${encodeURIComponent(host)}`);
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
 * 3. A space's custom domain serves only that space: `/` is its space page,
 *    `/event/*` its events (the page 404s other spaces' events), static files
 *    pass, and every other path goes to the main site.
 */
export async function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  if (pathname.startsWith('/.well-known/')) return NextResponse.next();

  if (hostname === 'unifesto.app') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.unifesto.app';
    return NextResponse.redirect(url, 308);
  }

  if (isOwnHost(hostname)) return NextResponse.next();

  const slug = await tenantSlug(hostname);
  if (!slug) return new NextResponse('Not found', { status: 404 });

  const headers = new Headers(request.headers);
  headers.set('x-tenant-host', hostname);
  headers.set('x-tenant-space', slug);

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = `/space/${slug}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (pathname === `/space/${slug}`) return NextResponse.redirect(new URL('/', request.url), 308);
  if (
    pathname.startsWith('/event/') ||
    pathname.startsWith(`/space/${slug}/`) || // its OG image
    pathname.startsWith('/public/') ||
    /\.[a-z0-9]+$/i.test(pathname) // files from /public
  ) {
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.redirect(`${MAIN}${pathname}${request.nextUrl.search}`, 307);
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
