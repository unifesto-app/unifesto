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
  // Note: eslint config moved to eslint.config.mjs (no longer supported in next.config)
  // Track V: the console lives under /console. The old paths stay forever for
  // backend emails, Apex links and shipped 4.0.5 builds; the query (mobile's
  // ?space= switch) passes through. These run before proxy.ts.
  async redirects() {
    return [
      { source: "/", destination: "/console", permanent: true },
      { source: "/dashboard/:path*", destination: "/console/:path*", permanent: true },
      { source: "/login", destination: "/console/login", permanent: true },
      { source: "/no-access", destination: "/console/no-access", permanent: true },
      { source: "/sponsor/:path*", destination: "/console/sponsor/:path*", permanent: true },
      { source: "/present/:path*", destination: "/console/present/:path*", permanent: true },
    ];
  },
};

// Source maps upload when SENTRY_AUTH_TOKEN is set (a BuildKit secret in the
// Dockerfile) and are deleted after upload, so no .map is ever served. The
// release is the git SHA deploy.sh passes in as SENTRY_RELEASE.
export default withSentryConfig(nextConfig, {
  org: "unifesto",
  project: "unifesto-space",
  silent: true,
  telemetry: false,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
