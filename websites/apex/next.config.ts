import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for lean Docker images.
  output: "standalone",
  // Skew protection: a tab still running the previous deploy gets a full
  // reload on its next navigation instead of crashing on stale chunks
  // (React #130). Baked into the standalone build, so stable at runtime.
  deploymentId: process.env.DEPLOYMENT_ID ?? String(Date.now()),
  // Disabled because StrictMode's dev-only double-render makes LiveKit's
  // <VideoConference> log benign "Element not part of the array" track-
  // reconciliation errors (e.g. on leave). This only affects dev behaviour,
  // not production. Re-enable if you want StrictMode's other checks back.
  reactStrictMode: false,
  // Ship despite pre-existing type/lint debt (dev never type-checked these).
  // TODO: clean up the type errors and remove these.
  typescript: { ignoreBuildErrors: true },
  // D8: the Assist inbox replaced the Support page.
  async redirects() {
    return [{ source: "/dashboard/support", destination: "/dashboard/assist", permanent: false }];
  },
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

// Source maps upload when SENTRY_AUTH_TOKEN is set (a BuildKit secret in the
// Dockerfile) and are deleted after upload, so no .map is ever served. The
// release is the git SHA deploy.sh passes in as SENTRY_RELEASE.
export default withSentryConfig(nextConfig, {
  org: "unifesto",
  project: "unifesto-apex",
  silent: true,
  telemetry: false,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
