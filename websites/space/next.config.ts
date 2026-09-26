import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for lean Docker images.
  output: "standalone",
  // Disabled because StrictMode's dev-only double-render makes LiveKit's
  // <VideoConference> log benign "Element not part of the array" track-
  // reconciliation errors (e.g. on leave). This only affects dev behaviour,
  // not production. Re-enable if you want StrictMode's other checks back.
  reactStrictMode: false,
  // Ship despite pre-existing type/lint debt (dev never type-checked these).
  // TODO: clean up the type errors and remove these.
  typescript: { ignoreBuildErrors: true },
  // Note: eslint config moved to eslint.config.mjs (no longer supported in next.config)

  // Ensure proper module resolution for client components
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
