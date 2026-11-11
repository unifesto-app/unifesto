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
# No build args: the pages prerender from https://api.unifesto.app, which the
# build must reach. NEXT_PUBLIC_UNIFESTO_API is only a local-testing override.
# ============================================================
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
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

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
