#!/usr/bin/env bash
set -euo pipefail

# Git-free deploy: sync this folder to the server and (re)build the
# Docker stack there. Source is copied over SSH — no GitHub involved.
#
# Deploy everything:
#   ./deploy.sh
# Deploy only some services (backend | apex | web), others keep running:
#   ./deploy.sh web            # just the public site
#   ./deploy.sh apex           # just the platform-admin dashboard
#   ./deploy.sh backend web    # both of these, leave the rest alone
# Check the gates below without touching the server (nothing synced or built):
#   ./deploy.sh --check
#   SERVER_MIGRATIONS=names.txt ./deploy.sh --check   # also the DROP guard, offline
# Put back the image each service ran before its last deploy (J13):
#   ./deploy.sh rollback                  # backend apex web
#   ./deploy.sh rollback backend          # the API (+ cert-worker) only
#   ROLLBACK_TO=<sha> ./deploy.sh rollback web   # a :<sha> image instead of :previous
#   Rollback never runs migrations backwards: the database keeps its schema.
#
# Gates (J13), checked before anything reaches the server:
#   - clean working tree, HEAD = origin/main after a fetch, CI green on HEAD.
#     FORCE=1 deploys anyway with a loud warning (a dirty tree tags :<sha>-dirty).
#   - env files (J14): deploy.sh never syncs .env files; the SERVER's copies are
#     the only prod secrets. Before a deploy the server must have ./.env,
#     backend/.env (every REQUIRED_BACKEND_ENV key), websites/apex/.env and
#     websites/web/.env.local (same INTERNAL_API_KEY as backend/.env). Checked over
#     ssh; keys only, values are never printed. No override. --check skips it.
#   - backend deploys: no DROP TABLE/COLUMN, column type change or TRUNCATE in
#     migrations the server's backend image doesn't have yet
#     (scripts/migration-guard.sh, same check as CI). ALLOW_DESTRUCTIVE=1 ships
#     them: a contract step goes out in its own deploy, after the code stopped
#     using what it drops.
# Every build is also tagged :<sha>, the image it replaced :previous, and the
# deployed SHA goes to ${REMOTE_DIR}/DEPLOYED_SHA (+ a line in DEPLOY_LOG).
#
# Port 22 is closed on the server's security group: SSH goes through AWS
# Systems Manager. Needs the AWS CLI + session-manager-plugin, a signed-in
# profile (`aws login --profile unifesto`) and the `Host i-*` ProxyCommand
# entry in ~/.ssh/config that runs `aws ssm start-session ... AWS-StartSSHSession`.
#
# Override targets via env vars:
#   SERVER=ubuntu@i-0123456789abcdef0 KEY=~/.ssh/unifesto-key.pem REMOTE_DIR=/home/ubuntu/unifesto ./deploy.sh

SERVER="${SERVER:-ubuntu@i-079d51280d1964117}"
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

# Keys the backend needs in the server's backend/.env (edited on the server only).
# INTERNAL_API_KEY must also be in websites/web/.env.local with the same value
# (SSR skips the shared throttle bucket); SENTRY_DSN + LOG_FORMAT=json turn on
# S35's error reporting and structured logs.
REQUIRED_BACKEND_ENV="INTERNAL_API_KEY SENTRY_DSN LOG_FORMAT JWT_SECRET DIRECT_URL"

MODE=deploy
case "${1:-}" in
  --check) MODE=check; shift ;;
  rollback) MODE=rollback; shift ;;
esac

# Any args are compose service names; no args = the whole stack. A rollback
# with no args covers every image deploy.sh builds.
SERVICES="$*"
if [ "${MODE}" = rollback ]; then SERVICES="${SERVICES:-backend apex web}"; fi

# Images deploy.sh builds and tags. backend-migrate and cert-worker run the
# backend's image.
# (A function, because macOS bash 3.2 can't parse `case` inside $(...).)
image_names() {
  local s
  for s in "$@"; do
    case "${s}" in
      backend|backend-migrate|cert-worker) echo unifesto-backend ;;
      apex|web) echo "unifesto-${s}" ;;
    esac
  done | sort -u | xargs
}
IMAGES="$(image_names ${SERVICES:-backend apex web})"

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

FAILED=0
FORCED=0
ok()   { echo "  ok     $*"; }
fail() { echo "  FAIL   $*" >&2; FAILED=1; }
# Git and CI gates: FORCE=1 turns a failure into a warning.
soft() { if [ "${FORCE:-}" = 1 ]; then echo "  FORCED $*" >&2; FORCED=1; else fail "$*"; fi; }

# KEY's value in a dotenv file, quotes stripped. Only ever compared, never printed.
env_val() {
  local v
  v="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r')" || true
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "${v}"
}

# Local gates: git state, CI, env keys. Sets SHA (the image tag + Sentry release).
run_gates() {
  local head origin dirty ci ci_note runs
  echo "==> Gates"
  head="$(git -C "${HERE}" rev-parse HEAD)"
  SHA="$(git -C "${HERE}" rev-parse --short HEAD)"

  dirty="$(git -C "${HERE}" status --porcelain)"
  if [ -z "${dirty}" ]; then
    ok "working tree clean"
  else
    soft "working tree has $(printf '%s\n' "${dirty}" | grep -c .) uncommitted or untracked paths (git status)"
    SHA="${SHA}-dirty"
  fi

  if git -C "${HERE}" fetch --quiet origin main; then
    origin="$(git -C "${HERE}" rev-parse origin/main)"
    if [ "${head}" = "${origin}" ]; then
      ok "HEAD ${head:0:7} is origin/main"
    else
      soft "HEAD ${head:0:7} is not origin/main (${origin:0:7}): deploy from an up-to-date main"
    fi
  else
    soft "could not fetch origin main"
  fi

  # The CI workflow's one job is "CI passed"; its run succeeding = green.
  # main's HEAD is usually the v5-log bot's docs-only commit, which CI never
  # runs on (GITHUB_TOKEN pushes trigger no workflows), so check the newest
  # first-parent commit that changed anything outside docs/: same code as HEAD.
  ci="$(git -C "${HERE}" rev-list -1 --first-parent HEAD -- . ':(exclude)docs')"
  ci_note="${ci:0:7}"
  if [ "${ci}" != "${head}" ]; then ci_note="${ci:0:7} (HEAD only adds docs/)"; fi
  runs="$(cd "${HERE}" && gh run list --commit "${ci}" --workflow CI --json status,conclusion \
    --jq '[.[] | if .conclusion == "" then .status else .conclusion end] | join(" ")' 2>/dev/null)" \
    || runs="unknown (gh failed: gh auth status?)"
  case " ${runs} " in
    *" success "*) ok "CI passed on ${ci_note}" ;;
    "  ") soft "no CI run for ${ci_note}" ;;
    *) soft "CI not green on ${ci_note}: ${runs}" ;;
  esac

  if [ "${MODE}" = check ]; then
    echo "  skip   server env files: checked over ssh at deploy time"
  else
    server_env_gate || FAILED=1
  fi
}

# J14: the env files live only on the server (rsync excludes them), so check
# them there. Prints key names only; a missing file or key fails the deploy
# before anything is synced, so the stack can't come up without its secrets.
server_env_gate() {
  { declare -f ok fail env_val; cat <<'ENVGATE'; } | ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" bash -s -- "${REMOTE_DIR}" ${REQUIRED_BACKEND_ENV}
set -uo pipefail
cd "$1" || exit 1
shift
FAILED=0
for f in .env backend/.env websites/apex/.env websites/web/.env.local; do
  if [ -f "${f}" ]; then ok "server has ${f}"; else fail "server is missing ${f}: deploy.sh no longer syncs env files, put it there by hand"; fi
done
missing=""
for key; do [ -n "$(env_val backend/.env "${key}")" ] || missing="${missing} ${key}"; done
if [ -z "${missing}" ]; then ok "server backend/.env has $*"; else fail "server backend/.env is missing:${missing}"; fi
web_key="$(env_val websites/web/.env.local INTERNAL_API_KEY)"
if [ -z "${web_key}" ]; then
  fail "server websites/web/.env.local is missing: INTERNAL_API_KEY"
elif [ "${web_key}" != "$(env_val backend/.env INTERNAL_API_KEY)" ]; then
  fail "INTERNAL_API_KEY in the server's websites/web/.env.local differs from backend/.env"
else
  ok "server websites/web/.env.local has the backend's INTERNAL_API_KEY"
fi
exit "${FAILED}"
ENVGATE
}

# S37 DROP check on the migrations in this checkout that $1 (one migration
# folder name per line: what the server's backend image already has) lacks.
drop_guard() {
  local d n pending=""
  for d in "${HERE}"/backend/prisma/migrations/*/; do
    n="$(basename "${d}")"
    grep -qxF "${n}" "$1" || pending="${pending} backend/prisma/migrations/${n}/migration.sql"
  done
  if [ -z "${pending}" ]; then
    ok "no migrations pending on the server"
    return
  fi
  echo "  pending migrations:"
  printf '    %s\n' ${pending}
  if (cd "${HERE}" && bash scripts/migration-guard.sh --deploy ${pending}); then
    ok "no destructive SQL in pending migrations"
  elif [ "${ALLOW_DESTRUCTIVE:-}" = 1 ]; then
    echo "  ALLOWED destructive SQL above (ALLOW_DESTRUCTIVE=1): migrate deploy will apply it" >&2
  else
    fail "destructive SQL in pending migrations (above). Ship it in its own deploy with ALLOW_DESTRUCTIVE=1, once the code that used it is gone. Already applied (e.g. after a rollback)? ALLOW_DESTRUCTIVE=1 is safe: migrate deploy skips applied ones."
  fi
}

if [ "${MODE}" != rollback ]; then
  run_gates
  if [ "${MODE}" = check ]; then
    if [ "${DEPLOY_BACKEND}" != true ]; then
      echo "  skip   DROP guard: no backend in this deploy"
    elif [ -n "${SERVER_MIGRATIONS:-}" ]; then
      drop_guard "${SERVER_MIGRATIONS}"
    else
      echo "  skip   DROP guard needs the server's migration list (SERVER_MIGRATIONS=<file> to run it offline)"
    fi
    if [ "${FAILED}" = 0 ]; then echo "==> Gates pass (release ${SHA})"; else echo "==> Gates FAILED" >&2; fi
    exit "${FAILED}"
  fi
  if [ "${FAILED}" != 0 ]; then
    echo "!! Refusing to deploy (see FAIL above)." >&2
    exit 1
  fi
  if [ "${FORCED}" = 1 ]; then
    echo "" >&2
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
    echo "!! FORCE=1: deploying ${SHA}, which is NOT a CI-green, clean origin/main." >&2
    echo "!! Whatever is in this folder goes to production as-is." >&2
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
    echo "" >&2
  fi
fi

if [ "${MODE}" = rollback ]; then
  if [ -z "${IMAGES}" ]; then
    echo "!! Nothing to roll back: name backend, apex or web." >&2
    exit 1
  fi
  echo "==> Rolling back: ${SERVICES}"
elif [ -n "${SERVICES}" ]; then
  echo "==> Deploying ${SHA}, only: ${SERVICES}"
else
  echo "==> Deploying ${SHA}, entire stack"
fi

# One deploy at a time. Two overlapping runs race `docker compose up` on the
# same containers ("No such container" mid-recreate) and interleave rsyncs of
# different trees. The lock lives ON THE SERVER (atomic mkdir — macOS has no
# flock) so it also guards deploys from other machines. It is released on any
# exit via the trap; if a run was killed hard and left it behind, the error
# says who holds it and how to clear it (or rerun with FORCE_UNLOCK=1).
LOCK_DIR="/home/ubuntu/.unifesto-deploy.lock"
LOCK_OWNER="$(whoami)@$(hostname -s) pid $$ at $(date -u +%Y-%m-%dT%H:%M:%SZ) [${MODE} ${SERVICES:-all}]"
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

# Roll the API one replica at a time (S17). `docker compose up -d backend`
# recreated all 3 replicas at once while boot takes up to 40s and Caddy only
# retries for 5s: that gap was the 502/503 flood on every backend deploy. For
# each OLD replica: add one NEW replica from the freshly built image, wait for
# its healthcheck, give Caddy's 10s DNS refresh time to see it, then stop the
# old one with the 60s drain. Peak is replicas+1 (4 x 1G, 4 x 10 DB conns).
# A new replica that never turns healthy is removed and the deploy fails with
# the old replicas still serving.
# autoheal is paused for the roll: the drain (`docker stop -t 60`) turns the old
# replica unhealthy, autoheal restarted it mid-drain and the plain `docker rm`
# then failed on a running container, killing the deploy half-rolled
# (2026-10-26). The trap starts autoheal again however the roll ends.
roll_backend() {
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" bash -s -- "${REMOTE_DIR}" <<'ROLLOUT'
set -euo pipefail
cd "$1"
if [ -n "$(docker compose ps -q autoheal 2>/dev/null)" ]; then
  docker compose stop autoheal >/dev/null
  trap 'docker compose start autoheal >/dev/null' EXIT
  echo "    autoheal paused for the roll"
fi
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
  # -f: even if something restarted it during the drain, it's out of rotation now.
  docker rm -f "${old}" >/dev/null
done
ROLLOUT
}

start_others() {
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
}

if [ "${MODE}" = rollback ]; then
  echo ""
  echo "!! Rollback does NOT run migrations backwards: the database keeps its current"
  echo "!! schema. The old code must still work against it, which expand/contract"
  echo "!! migrations guarantee and a contract step (DROP) does not."
  echo ""
  echo "==> Pointing :latest at :${ROLLBACK_TO:-previous} for ${IMAGES}"
  ROLLED="$(mktemp)"
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" bash -s -- "${ROLLBACK_TO:-previous}" ${IMAGES} > "${ROLLED}" <<'RETAG'
set -euo pipefail
target="$1"; shift
for img; do
  docker image inspect "${img}:${target}" >/dev/null 2>&1 \
    || { echo "!! ${img}:${target} is not on the server; nothing was changed" >&2; exit 1; }
done
for img; do
  docker tag "${img}:${target}" "${img}:latest"
  echo "    ${img}:latest = $(docker image inspect -f '{{join .RepoTags " "}}' "${img}:latest")" >&2
done
# The release SHA of what is now :latest (deploy.sh tags every build :<sha>).
docker image inspect -f '{{range .RepoTags}}{{println .}}{{end}}' "${img}:latest" \
  | sed -n 's/.*:\([0-9a-f]\{7,40\}\(-dirty\)\{0,1\}\)$/\1/p' | head -1
RETAG
  ROLLED_SHA="$(cat "${ROLLED}")"
  rm -f "${ROLLED}"
  if [ "${DEPLOY_BACKEND}" = true ]; then
    echo "==> Rolling backend replicas one at a time (no migrations)"
    roll_backend
  fi
  start_others
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "cd ${REMOTE_DIR} && echo '${ROLLED_SHA:-unknown}' > DEPLOYED_SHA && echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) rollback [${SERVICES}] to ${ROLLBACK_TO:-previous} = ${ROLLED_SHA:-unknown}\" >> DEPLOY_LOG"
  echo "==> Rolled back ${SERVICES} to ${ROLLED_SHA:-an untagged pre-J13 image}. Migrations were not touched."
  exit 0
fi

# DROP guard (S37 + J13): what the server's current backend image ships is what
# has already been through this guard, so anything newer is pending. Read before
# the rsync, so a refused deploy leaves the server exactly as it was.
if [ "${DEPLOY_BACKEND}" = true ]; then
  echo "==> DROP guard: migrations the server's backend image doesn't have yet"
  HAVE="$(mktemp)"
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
    "docker run --rm --entrypoint ls unifesto-backend:latest prisma/migrations" > "${HAVE}" \
    || echo "  (could not list the server's backend image: every migration counts as pending)" >&2
  drop_guard "${HAVE}"
  rm -f "${HAVE}"
  if [ "${FAILED}" != 0 ]; then
    echo "!! Refusing to deploy (see FAIL above)." >&2
    exit 1
  fi
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
# J14: no .env file is ever synced (the laptop's hold dev values). Excluded paths
# are also safe from --delete, so the server keeps its own copies.
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
  --exclude '/.claude/worktrees' \
  --exclude '/backend/coverage' \
  --exclude '/.env*' \
  --exclude '/backend/.env*' \
  --exclude '/websites/*/.env*' \
  --exclude '/backend/prisma/manual' \
  --exclude '/DEPLOYED_SHA' \
  --exclude '/DEPLOY_LOG' \
  "${HERE}/" "${SERVER}:${REMOTE_DIR}/"

echo "==> Building images on the server (release ${SHA})"
# Build first (no restart yet) so migrations can run against the NEW image
# before any replica serves traffic. Empty ${SERVICES} builds the whole stack —
# same scope as the old `up --build` with no args. The SHA is baked into the
# backend image as SENTRY_RELEASE. Each build is tagged :<sha>; when :latest
# moved, the image it pointed at becomes :previous for `./deploy.sh rollback`.
ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" bash -s -- "${REMOTE_DIR}" "${SHA}" "'${SERVICES}'" ${IMAGES} <<'BUILD'
set -euo pipefail
cd "$1"; sha="$2"; services="$3"; shift 3
# Hold on to what :latest is now; the build moves :latest off it.
for img; do docker tag "${img}:latest" "${img}:pre-build" 2>/dev/null || true; done
# The 29G root fills up otherwise (~2.5G of build cache per deploy; ENOSPC
# killed parallel Next builds on 2026-10-19 and 2026-10-21). Costs the
# backend's cached npm ci layers; the websites rebuild those anyway.
docker builder prune -af >/dev/null
docker image prune -f >/dev/null
SENTRY_RELEASE="${sha}" docker compose build ${services}
for img; do
  docker tag "${img}:latest" "${img}:${sha}"
  if docker image inspect "${img}:pre-build" >/dev/null 2>&1; then
    if [ "$(docker image inspect -f '{{.Id}}' "${img}:pre-build")" != "$(docker image inspect -f '{{.Id}}' "${img}:latest")" ]; then
      docker tag "${img}:pre-build" "${img}:previous"
    fi
    docker rmi "${img}:pre-build" >/dev/null
  fi
  # ponytail: keeps the 3 newest :<sha> tags per image (:previous and :latest
  # stay); older ones are untagged and freed by the next deploy's image prune.
  docker images "${img}" --format '{{.Tag}}' | grep -E '^[0-9a-f]{7,40}(-dirty)?$' | tail -n +4 \
    | xargs -I{} docker rmi "${img}:{}" >/dev/null 2>&1 || true
done
BUILD

# Apply DB migrations with the just-built image, before the API replicas start.
# The one-shot `backend-migrate` runs `prisma migrate deploy` and exits; it is
# idempotent (no pending migrations = no-op), so it is safe to run every time.
if [ "${DEPLOY_BACKEND}" = true ]; then
  echo "==> Applying database migrations (backend-migrate)"
  ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" \
    "cd ${REMOTE_DIR} && docker compose run --rm backend-migrate"
fi

if [ "${DEPLOY_BACKEND}" = true ]; then
  echo "==> Rolling backend replicas one at a time"
  roll_backend
fi

start_others

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

ssh ${SSH_OPTS} -i "${KEY}" "${SERVER}" "cd ${REMOTE_DIR} && echo '${SHA}' > DEPLOYED_SHA && echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy [${SERVICES:-all}] ${SHA}\" >> DEPLOY_LOG"

echo "==> Deployed ${SHA}. If it misbehaves: ./deploy.sh rollback ${SERVICES}"
echo "==> Done. Tail logs with:"
echo "    ssh -i ${KEY} ${SERVER} 'cd ${REMOTE_DIR} && docker compose logs -f ${SERVICES}'"
