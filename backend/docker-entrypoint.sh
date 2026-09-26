#!/bin/sh
set -e

# Apply any pending Prisma migrations before the app boots.
# Set RUN_MIGRATIONS=false to skip (e.g. when running multiple
# replicas and applying migrations from a single one-off job).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Applying database migrations (prisma migrate deploy)…"
  npx prisma migrate deploy
else
  echo "[entrypoint] RUN_MIGRATIONS=false — skipping migrations."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
