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
