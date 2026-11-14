import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  redirects() {
    return [
      // The site no longer has event pages; old links (posters, emails) land on the home page.
      { source: "/open-source-sprint", destination: "/", permanent: true },
      // Unifesto Orbit was renamed Unifesto Encore (14 Nov 2026). Also catches the old share-card
      // URLs under /orbit/, and the cached unifesto.app/orbit 308 that still lands on /orbit.
      { source: "/orbit/:path*", destination: "/encore/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
