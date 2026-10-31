/**
 * Pages prerendered once and reused for every visitor (`dynamic = 'force-static'`),
 * so a CDN can cache them. The K14 nonce can't apply to them (a prerendered page
 * has no per-request nonce), so src/proxy.ts sends them a CSP without one.
 *
 * Only pages whose server render is first-party belong here: marketing, legal,
 * and staff-written blog, help and careers. The one exception is /events: its
 * cards show organiser-written titles and venues, but only as React text and
 * fixed /event/ and /space/ links, never as HTML or a URL the organiser picks.
 * Keep it that way, or take /events off this list. Anything else showing
 * organiser or attendee content, a sign-in, or a form keeps the nonce.
 *
 * A page on this list must export `dynamic = 'force-static'`, and a
 * force-static page must be on it; scripts/cached-pages.check.mts fails the
 * build otherwise.
 */
export const CACHED_PAGES = [
  '/',
  '/about',
  '/acceptable-use',
  '/app',
  '/blog',
  '/blog/[slug]',
  '/careers/[id]',
  '/code-of-conduct',
  '/cookies',
  '/data-rights',
  '/delete-account',
  '/download',
  '/events',
  '/grievance',
  '/help',
  '/help/[slug]',
  '/huddle',
  '/links',
  '/orbit',
  '/orbit/terms',
  '/organiser-agreement',
  '/organisers',
  '/press',
  '/pricing',
  '/privacy',
  '/privacy-notice',
  '/privacy-requests',
  '/refund',
  '/security',
  '/sponsor-terms',
  '/sprint',
  '/stay',
  '/subprocessors',
  '/support',
  '/terms',
];

// A form next to /help/[slug]; Next matches the static segment first.
const NOT_CACHED = ['/help/contact'];

const patterns = CACHED_PAGES.map((route) => new RegExp(`^${route.replace(/\[[^\]/]+\]/g, '[^/]+')}$`));

export const isCachedPage = (pathname: string) =>
  !NOT_CACHED.includes(pathname) && patterns.some((p) => p.test(pathname));
