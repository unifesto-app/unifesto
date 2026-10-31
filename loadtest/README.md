# Restore drill and load test (J6)

Two jobs, in this order: prove a backup restores, then load-test the restored
copy. **Never point a load test at production** (decision D5). The scripts here
refuse the production hosts.

## What exists today (31 Oct 2026)

- RDS `unifesto-db` (db.t4g.small, single-AZ, ap-south-1a): automated backups
  on, kept 35 days, point-in-time restore to within ~5 minutes, a daily
  automated snapshot, plus manual snapshots.
- No restore has ever been drilled, and `deploy.sh` takes no snapshot before
  migrations. Take one by hand (step 1 below, "Take snapshot") before a risky
  migration.

## 1. Restore drill (AWS console, ~45 minutes, a few rupees)

The `unifesto-ops` IAM user can't touch RDS. Use the root session or an admin.

1. **RDS → Databases → `unifesto-db` → Actions → Restore to point in time.**
   - Restore time: *Latest restorable time* (or the moment you want to prove).
   - DB instance identifier: `unifesto-drill-<yyyymmdd>`.
   - Class `db.t4g.small`, single-AZ, **Public access: No**.
   - VPC security group: `unifesto-rds-sg` only (reachable from the server's
     security group, nothing else).
   - Write down the clock time you press **Restore**.
2. Wait for **Available**. The minutes since step 1 are the real recovery time
   (RTO). The restore time you picked bounds the data you'd lose (RPO).
3. **Check the copy is whole.** From the production server (it's in the
   security group that can reach the copy), with the drill endpoint from the
   console:

   ```bash
   cd ~/unifesto && docker compose run --rm --no-deps -e RUN_MIGRATIONS=false \
     -e DATABASE_URL='postgresql://<user>:<password>@<drill-endpoint>:5432/<db>?sslmode=require' \
     backend node dist/scripts/restore-check.js
   ```

   Run the same command without the `-e DATABASE_URL=…` line to print the same
   numbers for production. The migration count must match, and table counts and
   latest timestamps must match up to the restore time.
4. Keep the copy for the load test (section 2), or **delete it** (Actions →
   Delete, no final snapshot). A running drill instance costs about as much as
   production's database per hour.

Record the result (date, restore time, minutes to Available, counts matched)
in J6's board notes.

## 2. Staging copy for the load test

Prod data holds real emails, phone numbers and push tokens. Everything below
keeps a staging copy from messaging real people.

**Host.** A temporary EC2 `t3.large` (same size as production, so the numbers
mean something), launched from an AMI of the production server into the same
VPC and the server's security group. **Launch it with no IAM instance role**:
SES email and S3 uploads use the server's role, not a key in `.env`, so without
the role they can't send or write anything. Open 443 to your own IP only.
Terminate it afterwards.

**On the staging host, before starting anything:**

1. `backend/.env`:
   - `DATABASE_URL` and `DIRECT_URL` → the drill copy from section 1.
   - `SCHEDULER=off`: no crons, intervals or timeouts (reminders, digests,
     retention sweeps).
   - Blank every outbound key: `RESEND_API_KEY`, `WHATSAPP_ACCESS_TOKEN`,
     `ONESIGNAL_REST_API_KEY` and `ONESIGNAL_APP_ID` (push),
     `EXPO_TOKEN`, `ANTHROPIC_API_KEY`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
   - Razorpay → **test** keys (`rzp_test_…`).
   - `SENTRY_DSN` empty, so staging errors don't page production.
   - Keep `INTERNAL_API_KEY` (the load test sends it, see section 3).
2. Clear device tokens and turn on the App Review sign-in (it lets the load
   test sign in without sending OTPs):

   ```sql
   DELETE FROM user_push_devices;
   DELETE FROM admin_devices;
   UPDATE platform_config SET app_review_login_enabled = true;
   ```
3. Caddy: remove the `client_auth { … }` block from the `(cf_origin)` snippet
   in `Caddyfile` (load traffic comes straight from k6, not through Cloudflare).
4. `docker compose up -d`.

## 3. Load test (k6)

Install k6 (`brew install k6`) on a machine **other than** the staging host, so
the load generator doesn't eat the CPU it's measuring. Every script needs
`STAGING_IP` (the staging host's public IPv4): requests use production's
hostnames but always go to that IP, never through public DNS.

**Prepare (on the staging host):**

1. Pick a published event with a **free** ticket type in the copy. A paid one
   calls Razorpay on every order. From `GET /events/<slug>` you need its `id`
   (EVENT_ID), its `slug` (EVENT_SLUG) and the free ticket type's `id`
   (TICKET_TYPE_ID). Note a Curator or Crew user id of that event's space for
   the scanner.
2. Seed test users and their sign-in tokens, then copy the file next to these
   scripts on the k6 machine (it's gitignored; it grants sign-in on staging):

   ```bash
   docker compose run --rm --no-deps --entrypoint node backend \
     dist/scripts/loadtest-seed.js --staging --count=500 --scanner=<curator user id> > tokens.json
   ```

   It refuses production's database. The users have `+999…` numbers (not a
   real country code) and tokens valid for 6 hours.

**Run, one at a time, watching `docker stats` on staging and the drill
database's CPU in the RDS console:**

| Peak | Command |
|---|---|
| Viral event page (anonymous) | `STAGING_IP=… EVENT_SLUG=… INTERNAL_KEY=… k6 run event-page.js` |
| Sign-in rush (App Review account) | `STAGING_IP=… INTERNAL_KEY=… k6 run login.js` |
| Free-ticket rush (each seeded user once) | `STAGING_IP=… EVENT_ID=… TICKET_TYPE_ID=… INTERNAL_KEY=… k6 run checkout.js` |
| Gates open (scans the tickets just made) | `STAGING_IP=… EVENT_ID=… INTERNAL_KEY=… k6 run checkin.js` |
| Live leaderboard (Socket.IO + refetch) | `STAGING_IP=… EVENT_ID=… INTERNAL_KEY=… k6 run leaderboard.js` |

- `INTERNAL_KEY` = staging's `INTERNAL_API_KEY`. One k6 machine is one IP, and
  without the key the 300/min-per-IP limit would cap the test before the
  server does. Leave it out once to see the limits themselves.
- Each script fails its run when more than 1% of requests error or p95 latency
  goes over 800 ms. Raise the `stages` targets until that happens: the last
  passing target is the host's capacity for that peak.
- Leaderboard: if `engagement:subscribe` starts failing at about 300 a minute,
  that's the HTTP throttler applied to socket messages in one shared bucket (a
  finding to fix, not a capacity limit).
- If `login.js` gets an empty `accessToken`, the App Review account
  (`test-user@unifesto.app`) is missing from the copy or isn't mobile-verified.

**Record in J6's board notes:** per peak, the highest VU target that passed,
its p95 and error rate, and peak CPU and memory on the host and the database.
That decides J7: autoscaling is only worth it if the expected peak is above
what one `t3.large` takes.

## 4. Clean up

Terminate the staging EC2, delete the drill RDS instance, delete the AMI and
its snapshot. Put the numbers in J6's board notes.
