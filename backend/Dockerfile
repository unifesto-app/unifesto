# syntax=docker/dockerfile:1

# ============================================================
# Base — Node + openssl for the two install stages below.
# ============================================================
FROM node:24-bookworm-slim AS base
WORKDIR /app

# Prisma's query engine needs openssl, and so does the install: @prisma/engines
# picks the engine binaries (incl. the schema engine `migrate deploy` runs) by
# the openssl it finds. The native addons we depend on ship prebuilt binaries —
# @napi-rs/canvas (certificate PNGs, statically-linked Skia) and sharp — so
# there is no compile step and no build toolchain / graphics -dev headers.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ============================================================
# Builder — installs ALL deps (incl. dev), generates the Prisma
# client and compiles TS.
# ============================================================
FROM base AS builder

# NODE_ENV is intentionally NOT "production" here, so `npm ci`
# keeps devDependencies (typescript, @types/node…).
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client, then emit JS (-> dist/src/main.js). CI
# type-checks every backend PR (`tsc --noEmit`), so the image build only
# emits: --noCheck skips the type-check and --declaration false the .d.ts
# files nothing runs. Every .js and .js.map is byte-identical to `nest build`
# (273s -> 33s on a laptop; nest build took ~150s of every server deploy).
COPY . .
RUN npx prisma generate
RUN npx tsc -p tsconfig.build.json --noCheck --declaration false

# ============================================================
# Prod deps — runtime dependencies only. Its own stage, so it installs
# alongside the build and stays cached until the lockfile changes (it was
# `npm prune --omit=dev` after the build, ~1.5 min every deploy).
# ============================================================
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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

# Prod deps + the Prisma client generated in the builder (over the stub the
# prod install leaves), compiled output, the prisma schema/migrations (needed
# for `migrate deploy`), and the bundled certificate fonts (read at runtime
# from ./assets).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY package.json ./

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# J18: run as the image's unprivileged `node` user (uid 1000), not root. The
# app writes nothing under /app; the mounted backend/.env must be readable by
# uid 1000 (it is when the server's ubuntu user, also uid 1000, owns it).
USER node

# Matches PORT in your .env (the app logs "running on http://localhost:8080").
EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]

# Sentry release = git SHA, passed by deploy.sh (J13). Last, so a new SHA only
# adds a metadata layer and never busts the cached build above.
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
