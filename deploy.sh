#!/usr/bin/env bash
set -euo pipefail

# Git-free deploy: sync this folder to the server and (re)build the
# Docker stack there. Source is copied over SSH — no GitHub involved.
#
# Deploy everything:
#   ./deploy.sh
# Deploy only some services (backend | apex | space | web), others keep running:
#   ./deploy.sh web            # just the public site
#   ./deploy.sh apex           # just the platform-admin dashboard
#   ./deploy.sh backend space  # both of these, leave the rest alone
#
# Override targets via env vars:
#   SERVER=ubuntu@1.2.3.4 KEY=~/.ssh/unifesto-key.pem REMOTE_DIR=/home/ubuntu/unifesto ./deploy.sh

SERVER="${SERVER:-ubuntu@13.205.35.224}"
KEY="${KEY:-$HOME/.ssh/unifesto-key.pem}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/unifesto}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# SSH keepalive so a long remote step (e.g. `docker compose build`) can't leave
# the local side hung on a half-open connection after the server finishes. With
# no keepalive, a dropped/idle TCP link stays "ESTABLISHED" locally forever and
# the deploy stalls silently before the container swap. These probes (every 15s,
# give up after 4 misses ~= 60s) turn that into a clean failure that `set -e`
# catches. Unquoted at call sites on purpose, so the flags word-split into args.
SSH_OPTS="-o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ConnectTimeout=20"

# Any args are compose service names to rebuild; no args = the whole stack.
SERVICES="$*"

if [ -n "${SERVICES}" ]; then
  echo "==> Deploying only: ${SERVICES}"
else
  echo "==> Deploying entire stack"
fi

# One deploy at a time. Two overlapping runs race `docker compose up` on the
# same containers ("No such container" mid-recreate) and interleave rsyncs of
# different trees. The lock lives ON THE SERVER (atomic mkdir — macOS has no
# flock) so it also guards deploys from other machines. It is released on any
# exit via the trap; if a run was killed hard and left it behind, the error
# says who holds it and how to clear it (or rerun with FORCE_UNLOCK=1).
LOCK_DIR="/home/ubuntu/.unifesto-deploy.lock"
LOCK_OWNER="$(whoami)@$(hostname -s) pid $$ at $(date -u +%Y-%m-%dT%H:%M:%SZ) [${SERVICES:-all}]"
if [ "${FORCE_UNLOCK:-}" = 1 ]; then
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "rm -rf ${LOCK_DIR}"
fi
if ! ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
  "mkdir ${LOCK_DIR} 2>/dev/null && echo '${LOCK_OWNER}' > ${LOCK_DIR}/owner"; then
  HOLDER="$(ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "cat ${LOCK_DIR}/owner 2>/dev/null" || true)"
  echo "!! Another deploy is in progress: ${HOLDER:-unknown holder}" >&2
  echo "   If it is stale, rerun with FORCE_UNLOCK=1 ./deploy.sh ${SERVICES}" >&2
  exit 1
fi
release_lock() {
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "rm -rf ${LOCK_DIR}" \
    || echo "!! Could not release ${LOCK_DIR} on the server — remove it by hand." >&2
}
trap release_lock EXIT

# Does this deploy touch the backend? A full deploy (no args) always does; a
# targeted one only if "backend" is named. When it does, DB migrations must be
# applied with the freshly-built image BEFORE the API replicas start — otherwise
# code that reads a not-yet-added column 500s (expand/contract ordering).
DEPLOY_BACKEND=false
if [ -z "${SERVICES}" ]; then
  DEPLOY_BACKEND=true
else
  case " ${SERVICES} " in
    *" backend "*) DEPLOY_BACKEND=true ;;
  esac
fi

# Detect Caddyfile changes BEFORE we sync. The Caddyfile is a read-only
# bind-mount, and `docker compose up -d` does NOT reload caddy when only the
# mounted file changed — so a new/edited site block would sync but never take
# effect (unrouted host → empty 200 / white page). We compare the local file
# to what's currently on the server; if they differ, we restart caddy after
# the deploy so it re-reads the config. (shasum on macOS and sha1sum on Linux
# produce the same SHA1 digest.)
CADDY_LOCAL="$(shasum "${HERE}/Caddyfile" | cut -d' ' -f1)"
CADDY_REMOTE="$(ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "sha1sum ${REMOTE_DIR}/Caddyfile 2>/dev/null | cut -d' ' -f1" || true)"

echo "==> Syncing source to ${SERVER}:${REMOTE_DIR}"
rsync -az --delete \
  -e "ssh ${SSH_OPTS} -i ${KEY}" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude 'mobile' \
  --exclude 'certs' \
  --exclude '*.tsbuildinfo' \
  --exclude '.DS_Store' \
  --exclude '/_company' \
  --exclude '/.claude/settings.local.json' \
  --exclude '/backend/coverage' \
  --exclude '/backend/.env.local' \
  --exclude '/backend/prisma/manual' \
  --exclude '/backend/src/aws/examples' \
  "${HERE}/" "${SERVER}:${REMOTE_DIR}/"

echo "==> Building images on the server"
# Build first (no restart yet) so migrations can run against the NEW image
# before any replica serves traffic. Empty ${SERVICES} builds the whole stack —
# same scope as the old `up --build` with no args.
ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
  "cd ${REMOTE_DIR} && docker compose build ${SERVICES}"

# Apply DB migrations with the just-built image, before the API replicas start.
# The one-shot `backend-migrate` runs `prisma migrate deploy` and exits; it is
# idempotent (no pending migrations = no-op), so it is safe to run every time.
if [ "${DEPLOY_BACKEND}" = true ]; then
  echo "==> Applying database migrations (backend-migrate)"
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
    "cd ${REMOTE_DIR} && docker compose run --rm backend-migrate"
fi

# Roll the API one replica at a time (S17). `docker compose up -d backend`
# recreated all 3 replicas at once while boot takes up to 40s and Caddy only
# retries for 5s: that gap was the 502/503 flood on every backend deploy. For
# each OLD replica: add one NEW replica from the freshly built image, wait for
# its healthcheck, give Caddy's 10s DNS refresh time to see it, then stop the
# old one with the 60s drain. Peak is replicas+1 (4 x 1G, 4 x 10 DB conns).
# A new replica that never turns healthy is removed and the deploy fails with
# the old replicas still serving.
if [ "${DEPLOY_BACKEND}" = true ]; then
  echo "==> Rolling backend replicas one at a time"
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" bash -s -- "${REMOTE_DIR}" <<'ROLLOUT'
set -euo pipefail
cd "$1"
OLD="$(docker compose ps -q backend)"
if [ -z "${OLD}" ]; then
  docker compose up -d --no-deps backend
  exit 0
fi
for old in ${OLD}; do
  before="$(docker compose ps -q backend | sort)"
  count="$(printf '%s\n' "${before}" | grep -c .)"
  docker compose up -d --no-deps --no-recreate --scale "backend=$((count + 1))" backend
  new="$(comm -13 <(printf '%s\n' "${before}") <(docker compose ps -q backend | sort))"
  if [ -z "${new}" ]; then
    echo "!! no new backend replica appeared" >&2
    exit 1
  fi
  status=""
  for _ in $(seq 1 48); do
    status="$(docker inspect -f '{{.State.Health.Status}}' ${new})"
    [ "${status}" = healthy ] && break
    sleep 5
  done
  if [ "${status}" != healthy ]; then
    echo "!! new backend replica ${new} is '${status}' after 240s; removing it, old replicas keep serving" >&2
    docker logs --tail 50 ${new} >&2 || true
    docker rm -f ${new} >/dev/null
    exit 1
  fi
  echo "    ${new:0:12} healthy; draining ${old:0:12}"
  sleep 12
  docker stop -t 60 "${old}" >/dev/null
  docker rm "${old}" >/dev/null
done
ROLLOUT
fi

echo "==> Starting services on the server"
# Images are already built above, so `up -d` (no --build) just (re)creates the
# named services; already-running dependencies (e.g. caddy) are left untouched.
# The backend was rolled above, so it is excluded here (--no-deps keeps compose
# from recreating it as a dependency of the web apps).
# --remove-orphans stops containers for services deleted from the compose file
# (e.g. the retired `hack` app) instead of leaving them running unrouted.
if [ -n "${SERVICES}" ]; then
  OTHERS="$(printf '%s\n' ${SERVICES} | grep -vx backend | xargs || true)"
  # cert-worker runs the backend image, so it follows every backend deploy.
  if [ "${DEPLOY_BACKEND}" = true ]; then OTHERS="${OTHERS} cert-worker"; fi
else
  OTHERS="$(ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
    "cd ${REMOTE_DIR} && docker compose config --services" | grep -vxE 'backend|backend-migrate' | xargs)"
fi
if [ -n "${OTHERS}" ]; then
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
    "cd ${REMOTE_DIR} && docker compose up -d --no-deps --remove-orphans ${OTHERS}"
fi
ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "cd ${REMOTE_DIR} && docker compose ps"

# Reload the proxy only when the Caddyfile actually changed (see note above).
if [ "${CADDY_LOCAL}" != "${CADDY_REMOTE}" ]; then
  echo "==> Caddyfile changed — validating, then restarting caddy to load it"
  # A throwaway container (fresh bind mount, no published ports) validates the
  # synced file first, so a bad Caddyfile fails the deploy instead of taking
  # every site down.
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
    "cd ${REMOTE_DIR} && docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile"
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "cd ${REMOTE_DIR} && docker compose restart caddy"
else
  echo "==> Caddyfile unchanged — leaving caddy running"
fi

echo "==> Done. Tail logs with:"
echo "    ssh -i ${KEY} ${SERVER} 'cd ${REMOTE_DIR} && docker compose logs -f ${SERVICES}'"
