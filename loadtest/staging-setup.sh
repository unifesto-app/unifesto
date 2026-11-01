#!/usr/bin/env bash
# J6: turn a server launched from an image of production into an isolated
# load-test target, pointed at a restored copy of the database. Run it ON THE
# STAGING HOST, from the laptop:
#
#   ssh -i ~/.ssh/unifesto-key.pem ubuntu@<staging ip> \
#     bash -s -- <copy db identifier> < loadtest/staging-setup.sh
#
# The server and the copy must sit in their own security group
# (unifesto-staging-sg), never unifesto-ec2-sg: every container restarts on
# boot with production's .env, and only the security group keeps them away
# from production's database and Redis (its queues and cron locks) until this
# script has run. See loadtest/README.md section 2.
set -euo pipefail

COPY="${1:?usage: staging-setup.sh <copy db identifier, e.g. unifesto-staging-20261101>}"
PROD_INSTANCE=i-079d51280d1964117

# 0. Never on production, never against production's database.
tok=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
iid=$(curl -s -H "X-aws-ec2-metadata-token: $tok" http://169.254.169.254/latest/meta-data/instance-id)
if [ -z "$iid" ] || [ "$iid" = "$PROD_INSTANCE" ]; then
  echo "Refusing: this is production (or not EC2): '$iid'" >&2
  exit 1
fi
case "$COPY" in
  unifesto-db | unifesto-db.*) echo "Refusing: $COPY is production's database" >&2; exit 1 ;;
esac

cd ~/unifesto

# 1. Stop everything that started from the image.
docker compose down --remove-orphans

# 2. The copy, a local Redis, no scheduler, no outbound keys, fresh secrets.
#    A new JWT_SECRET means no token minted here works on production.
KEY=$(openssl rand -hex 24)
python3 - "$COPY" "$KEY" <<'PY'
import re, secrets, sys
copy, key = sys.argv[1], sys.argv[2]

def edit(path, sets):
    lines = open(path).read().split('\n')
    seen = set()
    for i, line in enumerate(lines):
        m = re.match(r'([A-Z0-9_]+)=', line)
        if m and m.group(1) in sets:
            k, v = m.group(1), sets[m.group(1)]
            lines[i] = f'{k}={v(line[len(k) + 1:]) if callable(v) else v}'
            seen.add(k)
    lines += [f'{k}={v}' for k, v in sets.items() if k not in seen and not callable(v)]
    open(path, 'w').write('\n'.join(lines))

to_copy = lambda v: v.replace('unifesto-db.', copy + '.')
outbound = [
    'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
    'ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY', 'EXPO_TOKEN', 'ANTHROPIC_API_KEY',
    'CLOUDFLARE_API_TOKEN', 'UPTIMEROBOT_API_KEY', 'SENTRY_DSN', 'SENTRY_AUTH_TOKEN',
    'SENTRY_API_TOKEN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_ACCOUNT_NUMBER',
]
edit('backend/.env', {
    'DATABASE_URL': to_copy, 'DIRECT_URL': to_copy,
    'REDIS_HOST': 'staging-redis', 'REDIS_PORT': '6379', 'REDIS_TLS': 'false',
    'SCHEDULER': 'off', 'JWT_SECRET': secrets.token_hex(32), 'INTERNAL_API_KEY': key,
    **{k: '' for k in outbound},
})
edit('websites/web/.env.local', {'INTERNAL_API_KEY': key})
edit('.env', {'CLOUDFLARE_PURGE_TOKEN': ''})
PY
grep -E '^DATABASE_URL=' backend/.env | grep -q "@$COPY\." || { echo "DATABASE_URL does not point at $COPY" >&2; exit 1; }
grep -qE '^REDIS_HOST=staging-redis$' backend/.env || { echo "REDIS_HOST not switched" >&2; exit 1; }

# 3. k6 connects straight to this host, not through Cloudflare, so drop the
#    origin's client-certificate check (J18) here only.
python3 - <<'PY'
out, depth = [], None
for line in open('Caddyfile').read().split('\n'):
    if depth is None and line.strip() == 'client_auth {':
        depth = 1
        continue
    if depth is not None:
        depth += line.count('{') - line.count('}')
        if depth <= 0:
            depth = None
        continue
    out.append(line)
open('Caddyfile', 'w').write('\n'.join(out))
PY
if grep -qE '^\s*client_auth \{' Caddyfile; then echo "client_auth still in Caddyfile" >&2; exit 1; fi

# 4. Redis of its own (production's is out of reach by security group).
cat > docker-compose.override.yml <<'YML'
services:
  staging-redis:
    image: redis:7-alpine
    restart: unless-stopped
YML
docker compose up -d staging-redis

# 5. On the copy only: no push targets, App Review sign-in on, no 18+ gate for
#    seeded users, and one future public event with a free ticket in a space
#    with no attendee cap (General caps at 300, which would fail checkout early).
docker compose run -T --rm --no-deps -e COPY="$COPY" --entrypoint node backend -e '
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!host.startsWith(process.env.COPY + ".")) throw new Error("Refusing: " + host);
const p = new PrismaClient();
(async () => {
  await p.$executeRawUnsafe("DELETE FROM user_push_devices");
  await p.$executeRawUnsafe("DELETE FROM admin_devices");
  await p.$executeRawUnsafe("UPDATE platform_config SET app_review_login_enabled = true, require_age_confirmation = false");
  const ev = await p.event.findFirst({
    where: { deletedAt: null, visibility: "PUBLIC", status: { in: ["PUBLISHED", "ONGOING", "COMPLETED"] }, space: { status: "ACTIVE" } },
    orderBy: { startDateTime: "desc" },
  });
  if (!ev) throw new Error("No public event in an active space on the copy");
  const start = new Date(Date.now() + 14 * 864e5);
  await p.event.update({
    where: { id: ev.id },
    data: { status: "PUBLISHED", startDateTime: start, endDateTime: new Date(+start + 6 * 36e5), capacity: null, cancelledAt: null },
  });
  const sub = await p.orgSubscription.findUnique({ where: { spaceId: ev.spaceId } });
  if (sub) await p.orgSubscription.update({ where: { spaceId: ev.spaceId }, data: { plan: "ENTERPRISE" } });
  else await p.orgSubscription.create({ data: { spaceId: ev.spaceId, plan: "ENTERPRISE" } });
  const tt = await p.eventTicketType.create({
    data: { eventId: ev.id, name: "Load test (free)", price: 0, perUserLimit: 1, isActive: true, isVisible: true },
  });
  const admin = await p.userRole.findFirst({ where: { spaceId: ev.spaceId, role: { code: "SPACE_ADMIN" } } });
  console.log(JSON.stringify({ EVENT_ID: ev.id, EVENT_SLUG: ev.slug, TICKET_TYPE_ID: tt.id, SCANNER_ID: admin ? admin.userId : ev.createdBy }));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
' </dev/null | tee loadtest-event.json

# 6. Start the API (3 replicas, as in production), the web app and Caddy.
docker compose up -d backend web caddy
for _ in $(seq 1 30); do
  curl -sk --resolve api.unifesto.app:443:127.0.0.1 https://api.unifesto.app/health | grep -q '"ok":true' && break
  sleep 5
done
curl -sk --resolve api.unifesto.app:443:127.0.0.1 https://api.unifesto.app/health; echo

# 7. Seed 500 test users and their 6-hour tokens (refuses production's database).
scanner=$(python3 -c 'import json; print(json.load(open("loadtest-event.json"))["SCANNER_ID"])')
docker compose run -T --rm --no-deps --entrypoint node backend \
  dist/scripts/loadtest-seed.js --staging --count=500 --scanner="$scanner" </dev/null > tokens.json

echo
echo "Ready. On the laptop, copy tokens.json next to the k6 scripts and use:"
echo "  INTERNAL_KEY=$KEY"
cat loadtest-event.json
