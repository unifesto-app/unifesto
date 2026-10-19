# syntax=docker/dockerfile:1

# ============================================================
# Builder — installs ALL deps (incl. dev), generates the Prisma
# client, compiles TS, then prunes dev deps for a lean runtime.
# ============================================================
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Prisma's query engine needs openssl. The native addons we depend on ship
# prebuilt binaries — @napi-rs/canvas (certificate PNGs, statically-linked Skia)
# and sharp — so there is no compile step and
# no build toolchain / graphics -dev headers to install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# NODE_ENV is intentionally NOT "production" here, so `npm ci`
# keeps devDependencies (@nestjs/cli, typescript, @types/node…).
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client, then build (-> dist/src/main.js).
COPY . .
RUN npx prisma generate
RUN npm run build

# Strip devDependencies so the runner copies a lean node_modules
# (keeps the already-generated Prisma client, which lives under
#  node_modules/.prisma + node_modules/@prisma/client).
RUN npm prune --omit=dev

# ============================================================
# Runner — minimal image that just runs the compiled app.
# ============================================================
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# openssl for Prisma. @napi-rs/canvas statically links Skia, so none of the
# Cairo/Pango/rsvg runtime libs are needed anymore — just a base sans on disk:
# fonts-dejavu-core supplies DejaVu, which the certificate renderer aliases to
# the default "Helvetica", and fontconfig lets Skia enumerate it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# Pruned prod deps + generated Prisma client, compiled output,
# the prisma schema/migrations (needed for `migrate deploy`), and the
# bundled certificate fonts (read at runtime from ./assets).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY package.json ./

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Matches PORT in your .env (the app logs "running on http://localhost:8080").
EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]

# Sentry release = git SHA, passed by deploy.sh (J13). Last, so a new SHA only
# adds a metadata layer and never busts the cached build above.
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
