import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to handle domain redirects while preserving .well-known paths
 * 
 * CRITICAL: .well-known paths MUST NOT be redirected for App Links/Universal Links to work.
 * Android and iOS verify domain ownership by fetching these files with HTTP 200 status.
 * Any redirect (307, 308, etc.) will cause verification to fail.
 */
export function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  // CRITICAL: Allow .well-known paths without ANY redirect
  // These are handled by route handlers in app/.well-known/
  if (pathname.startsWith('/.well-known/')) {
    return NextResponse.next();
  }

  // Redirect unifesto.app to www.unifesto.app for all other paths
  if (hostname === 'unifesto.app') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.unifesto.app';
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
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
