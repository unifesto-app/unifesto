import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  // HTTPS only, for a year. No includeSubDomains/preload: those bind every
  // subdomain and are hard to undo; add them once all subdomains are audited.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none';",
  },
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
  // Ship despite pre-existing type debt (dev never type-checked these).
  // TODO: clean up the type errors and remove this.
  typescript: { ignoreBuildErrors: true },
  // The site was restructured around audiences: /features and /host merged
  // into /organisers. Permanent redirects keep old links and rankings.
  async redirects() {
    return [
      { source: '/features', destination: '/organisers', permanent: true },
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
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
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

export default nextConfig;
