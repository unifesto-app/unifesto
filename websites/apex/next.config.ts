import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for lean Docker images.
  output: "standalone",
  // Skew protection: a tab still running the previous deploy gets a full
  // reload on its next navigation instead of crashing on stale chunks
  // (React #130). Baked into the standalone build, so stable at runtime.
  deploymentId: process.env.DEPLOYMENT_ID ?? String(Date.now()),
  // D8 moved the Support page to the Assist inbox; it's the Support desk again
  // (Assist is only the AI's name), so old Assist links land there.
  async redirects() {
    return [{ source: "/dashboard/assist", destination: "/dashboard/support", permanent: false }];
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
