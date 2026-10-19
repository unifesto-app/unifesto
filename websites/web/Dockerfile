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
# NEXT_PUBLIC_* values are inlined at build time, so pass them
# as build args, e.g.:
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.unifesto.app \
#     -t unifesto-web .
# ============================================================
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
# Sentry: per-app DSN (no-op when empty) and the release SHA from deploy.sh.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_RELEASE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1

# Sentry source-map upload token: a BuildKit secret, so it is never in an image
# layer or the runner (docker-compose.yml passes it from ./.env; absent = no upload).
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN npm run build

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

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
