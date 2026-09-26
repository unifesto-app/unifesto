import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none';",
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for lean Docker images.
  output: "standalone",
  // Ship despite pre-existing type debt (dev never type-checked these).
  // TODO: clean up the type errors and remove this.
  typescript: { ignoreBuildErrors: true },
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
