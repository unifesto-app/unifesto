# syntax=docker/dockerfile:1

# ============================================================
# Deps — install once, cached on package manifests.
# ============================================================
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ============================================================
# Builder — compile the Next.js app (standalone output).
#
# NEXT_PUBLIC_* values are inlined at build time, so they must
# be supplied as build args, e.g.:
#   docker build \
#     --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.unifesto.app \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.unifesto.app \
#     -t unifesto-apex .
# ============================================================
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_API_URL
# Sentry: per-app DSN (no-op when empty) and the release SHA from deploy.sh.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_RELEASE
# Browser key for the event form's venue search (Places). Optional: without it
# the search box is hidden and organisers type the venue by hand.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ============================================================
# Runner — minimal image serving the standalone server.
# ============================================================
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone build = server.js + only the traced node_modules.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
