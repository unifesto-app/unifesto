import { readdirSync } from "node:fs";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  // HTTPS only, for a year. No includeSubDomains/preload: those bind every
  // subdomain and are hard to undo; add them once all subdomains are audited.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Content-Security-Policy is set per request in src/proxy.ts (nonce, K14).
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for lean Docker images.
  output: "standalone",
  // Skew protection: a tab still running the previous deploy gets a full
  // reload on its next navigation instead of crashing on stale chunks
  // (React #130). Baked into the standalone build, so stable at runtime.
  deploymentId: process.env.DEPLOYMENT_ID ?? String(Date.now()),
  // S3 uploads (banners, posters) go through the optimizer via lib/img.ts.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "unifesto-storage-bucket.s3.ap-south-1.amazonaws.com" }],
  },
  // The site was restructured around audiences: /features and /host merged
  // into /organisers. Permanent redirects keep old links and rankings.
  async redirects() {
    return [
      { source: '/features', destination: '/organisers', permanent: true },
      // Apex links legal docs as /<slug>; the Orbit terms live under /orbit.
      { source: '/orbit-terms', destination: '/orbit/terms', permanent: true },
      { source: '/host', destination: '/organisers', permanent: true },
      { source: '/products', destination: '/organisers', permanent: true },
      // Account pages moved to the app (the website has no sign-in).
      { source: '/certificates', destination: '/app', permanent: true },
      { source: '/profile', destination: '/app', permanent: true },
      // Legacy URLs Search Console still crawls (old site's routes).
      { source: '/terms-and-conditions', destination: '/terms', permanent: true },
      { source: '/refund-policy', destination: '/refund', permanent: true },
      { source: '/org/:slug', destination: '/space/:slug', permanent: true },
      { source: '/events/:space', destination: '/space/:space', permanent: true },
      // Hackathons were renamed Unifesto Sprint.
      { source: '/hackathons', destination: '/sprint', permanent: true },
      // Unifesto Huddle (online sessions) was retired; keep its old links alive.
      { source: '/huddle', destination: '/organisers', permanent: true },
      { source: '/session/:slug*', destination: '/events', permanent: true },
      // There is no public API yet; the old /docs page described one.
      { source: '/docs', destination: '/help', permanent: true },
      // One sign-in for everyone (Track V8): the console's own login is gone.
      // `next` passes through, so a console deep link still comes back.
      { source: '/console/login', destination: '/login', permanent: true },
      // /console is everyone's home (Track V9): my tickets, account and
      // feedback live there now. Old links, emails and app builds land on the
      // same page; :path* also matches the bare path, and the query passes.
      { source: '/tickets/:path*', destination: '/console/tickets/:path*', permanent: true },
      { source: '/account/:path*', destination: '/console/account/:path*', permanent: true },
      { source: '/feedback/:path*', destination: '/console/feedback/:path*', permanent: true },
      // No one is turned away any more: an account without a space role gets the personal pages.
      { source: '/console/no-access', destination: '/console', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // The public API lives in this app as Route Handlers under
      // /app/api/public/*. Expose them at /public/* so the frontend clients
      // (which call `${NEXT_PUBLIC_API_URL}/public/...`) resolve when the API
      // host (api.unifesto.app) is aliased to this Next.js deployment.
      {
        source: '/public/:path*',
        destination: '/api/public/:path*',
      },
      // Next names an opengraph-image inside a route group with a hash of its
      // folder (src/app/(public)/event/[slug] → /event/x/opengraph-image-1vzko7).
      // Keep the plain URL that shared cards and blog JSON-LD already point at.
      // The hash changes if the folder moves; the build prints the new name.
      ...Object.entries({
        '/blog/:slug': '16v7k9',
        '/event/:slug': '1vzko7',
        '/help/:slug': '13qqj8',
        '/space/:spaceSlug': 'eabv7x',
        '/verify/:code': '1ir9a6',
      }).map(([dir, hash]) => ({
        source: `${dir}/opengraph-image`,
        destination: `${dir}/opengraph-image-${hash}`,
      })),
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Razorpay Checkout opens bank / 3-D Secure pages in a popup that
        // reports back to this tab; `same-origin` would cut that link. Last
        // match wins in Next, so this overrides the header above here only.
        // The event page too: COOP is fixed at document load, and "Register"
        // is a client-side navigation from there.
        source: '/event/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
      {
        // The console (Track V): the check-in scanner reads QR codes, so camera
        // for this origin. Billing,
        // attendees/add and My tickets (waiting-list spots) take Razorpay
        // payments, reached by client-side navigation, so the popup-friendly
        // COOP covers all of it.
        source: '/console/:path*',
        headers: [
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self)' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      // /public files keep their names across deploys (no content hash), so a
      // day in browsers and at Cloudflare instead of Next's max-age=0, which
      // re-checked the origin on every view. deploy.sh purges Cloudflare's copy.
      // One rule per file, so a 404 under /press/ isn't cached for a day; dot
      // folders (.well-known) keep their own headers below.
      ...readdirSync('public', { recursive: true, withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => `${f.parentPath.slice('public'.length)}/${f.name}`)
        .filter((path) => !path.startsWith('/.'))
        .map((source) => ({
          source,
          headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
        })),
      {
        // Serve apple-app-site-association with correct content type for iOS Universal Links
        source: '/.well-known/apple-app-site-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },
      {
        // Serve assetlinks.json with correct content type for Android App Links
        source: '/.well-known/assetlinks.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },
    ];
  },
};

// Source maps upload when SENTRY_AUTH_TOKEN is set (a BuildKit secret in the
// Dockerfile) and are deleted after upload, so no .map is ever served. The
// release is the git SHA deploy.sh passes in as SENTRY_RELEASE.
export default withSentryConfig(nextConfig, {
  org: "unifesto",
  project: "unifesto-web",
  silent: true,
  telemetry: false,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
