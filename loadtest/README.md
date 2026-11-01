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

**Never launch staging in `unifesto-ec2-sg`.** Every container is
`restart: unless-stopped`, so a server made from an image of production boots
straight into production's `.env`. In the server's security group it would
reach production's database and production's Redis (ElastiCache), take real
jobs off the email and certificate queues and compete for the cron locks.
`unifesto-rds-sg` and `unifesto-redis-sg` admit only `unifesto-ec2-sg`, so a
separate group keeps staging away from both until it's reconfigured.

1. **Security group** `unifesto-staging-sg` in `unifesto-vpc`: SSH 22 and HTTPS
   443 from your own IP only, and PostgreSQL 5432 from the group itself.
2. **Database copy:** restore as in section 1, but into `unifesto-staging-sg`
   only (not `unifesto-rds-sg`), with automated backups off.
3. **Image:** EC2 `create-image` of the production server **with
   `--no-reboot`** (the default reboots production).
4. **Host:** a `t3.large` (production's size, so the numbers mean something)
   from that image, in production's subnet and `unifesto-staging-sg`, with a
   public IP and **no IAM instance profile**: SES and S3 use the server's role,
   so without it they can't send or write. No role also means no SSM, so SSH
   goes straight to the IP: `ssh -i ~/.ssh/unifesto-key.pem ubuntu@<ip>`.
5. **Make it safe and ready** with [`staging-setup.sh`](staging-setup.sh),
   copied up and run as a file (piped over SSH, `docker compose run` could
   swallow the rest of the script):

   ```bash
   scp -i ~/.ssh/unifesto-key.pem loadtest/staging-setup.sh ubuntu@<ip>:
   ssh -i ~/.ssh/unifesto-key.pem ubuntu@<ip> bash staging-setup.sh <copy db identifier>
   ```

   It refuses production's instance and database, stops what booted, then:
   points the backend at the copy and a local Redis, sets `SCHEDULER=off`,
   blanks every outbound key (Resend, WhatsApp, push, Expo, Anthropic,
   Cloudflare, UptimeRobot, Sentry, Razorpay), sets a new `JWT_SECRET` (no
   token minted on staging works on production) and a new `INTERNAL_API_KEY`,
   removes Caddy's `client_auth` block (k6 doesn't come through Cloudflare),
   and on the copy only clears device tokens, turns on the App Review sign-in
   and off the 18+ gate. The copy usually has no upcoming event, so it moves
   the latest public event 14 days ahead with a free ticket, on Enterprise
   (General caps an event at 300 attendees, which would fail checkout early).
   Last, it starts the API, web and Caddy, seeds 500 test users into
   `tokens.json` and prints `INTERNAL_KEY`, `EVENT_ID`, `EVENT_SLUG` and
   `TICKET_TYPE_ID`.

## 3. Load test (k6)

Install k6 (`brew install k6`) on a machine **other than** the staging host, so
the load generator doesn't eat the CPU it's measuring. Every script needs
`STAGING_IP` (the staging host's public IPv4): requests use production's
hostnames but always go to that IP, never through public DNS.

**Prepare:** copy `tokens.json` from the staging host next to these scripts
(it's gitignored; it grants sign-in on staging for 6 hours):

```bash
scp -i ~/.ssh/unifesto-key.pem ubuntu@<ip>:unifesto/tokens.json loadtest/
```

**Run, one at a time, watching `docker stats` on staging and the copy's CPU in
the RDS console.** Pass settings with `-e`: k6 2.x doesn't read shell
variables unless given `--include-system-env-vars`.

| Peak | Command |
|---|---|
| Viral event page (anonymous) | `k6 run -e STAGING_IP=… -e EVENT_SLUG=… -e INTERNAL_KEY=… event-page.js` |
| Sign-in rush (App Review account) | `k6 run -e STAGING_IP=… -e INTERNAL_KEY=… login.js` |
| Free-ticket rush (each seeded user once) | `k6 run -e STAGING_IP=… -e EVENT_ID=… -e TICKET_TYPE_ID=… -e INTERNAL_KEY=… checkout.js` |
| Gates open (scans the tickets just made) | `k6 run -e STAGING_IP=… -e EVENT_ID=… -e INTERNAL_KEY=… checkin.js` |
| Live leaderboard (Socket.IO + refetch) | `k6 run -e STAGING_IP=… -e EVENT_ID=… -e INTERNAL_KEY=… leaderboard.js` |

- `INTERNAL_KEY` = staging's `INTERNAL_API_KEY`. One k6 machine is one IP, and
  without the key the 300/min-per-IP limit would cap the test before the
  server does. Leave it out once to see the limits themselves.
- Each script fails its run when more than 1% of requests error or p95 latency
  goes over 800 ms. Raise the `stages` targets until that happens: the last
  passing target is the host's capacity for that peak.
- Leaderboard: socket messages are no longer rate-limited (J24, #522). Before
  that, `engagement:subscribe` failed at about 300 a minute platform-wide.
- If `login.js` gets an empty `accessToken`, the App Review account
  (`test-user@unifesto.app`) is missing from the copy or isn't mobile-verified.

**Record in J6's board notes:** per peak, the highest VU target that passed,
its p95 and error rate, and peak CPU and memory on the host and the database.
That decides J7: autoscaling is only worth it if the expected peak is above
what one `t3.large` takes.

## 4. Clean up

Terminate the staging EC2, delete the copy (no final snapshot), deregister the
AMI and delete its snapshot, then delete `unifesto-staging-sg`. Put the
numbers in J6's board notes.
