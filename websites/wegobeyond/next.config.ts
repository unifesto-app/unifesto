import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The site no longer has event pages; old links (posters, emails) land on the home page.
  redirects() {
    return [{ source: "/open-source-sprint", destination: "/", permanent: true }];
  },
};

export default nextConfig;
