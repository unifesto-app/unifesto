# Unifesto version 5

The single plan and log for 5.x. **One fixed date: 5.0.0 releases on Wed 2 Dec 2026, and not before.** Everything else has no deadline and moves at its own pace, one track at a time. This replaces `version-4.md`, every per-feature plan doc, and the October 2026 audit. Everything still open from those has been carried over here.

Covers mobile, backend, and all four websites (web, space, apex, plus the retired hack app's leftovers).

## How to use this file

- **Pick a track** from [Tracks](#tracks) and work through its items. Several tracks can be open at once.
- **Status:** `next` · `planned` · `in progress` · `done` · `parked` · `dropped`. Never delete an item. Mark it `dropped` with a reason instead.
- **When something lands:** tick it, then add a line to [Log](#log): date, what, PR.
- **When something ships:** add a row to [Releases](#releases). A release is just whatever was finished when you decided to ship.

### Shipping rules

| Bump | When | Ships as |
|---|---|---|
| Major (5.0.0) | Removed features, forced update, new architecture | Store build |
| Minor (5.x.0) | New features or screens | OTA if JS-only, store build if native changed |
| Patch (5.x.y) | Fixes and polish | OTA if JS-only |

- Version lives in `mobile/app.config.js`. EAS auto-increments build numbers.
- OTA uses `runtimeVersion: fingerprint`. A native change on `main` silently blocks **every** later OTA until a store build ships. [Track O](#o--ota-updates-that-always-reach-people) is the fix and the rules: native PRs wait for a store-build window, CI flags them, and one rollout runs at a time. Runbook: `mobile/docs/OTA.md`.
- Backend: run the drift check and read every new migration before each `./deploy.sh`.
- Raise the minimum app version only after a build is live on **both** stores.

### Standing decisions

| # | Decision |
|---|---|
| D1 | OTA reload: reload silently if the app was away 30 min or more, otherwise apply on next cold start (`mobile/src/lib/otaUpdate.ts`). |
| D2 | Support routing: **organiser first**. Event questions go to the space inbox, which can escalate. Unifesto handles account, payment and app issues and sees everything. |
| D3 | Mobile scope: **on-site and time-critical work lives on mobile, desk work lives on web.** Mobile authoring screens get an "Open on web" handoff instead of new features. See [Track G](#g--mobile-scope-design-and-performance). |
| D4 | Company books in Zoho Books. Apex pushes monthly platform revenue through its API. |
| D5 | Load testing never touches production. Use a staging copy only. |
| D6 | **No store release before Wed 2 Dec 2026.** 5.0.0 is the next store build and goes live on both stores that day. Whatever is done and device-QA'd by the freeze ships in it; the rest waits for 5.x. |

### 5.0.0 · release Wed 2 Dec 2026

Worked back from the date, with room for one store rejection. Only the release day is fixed; the other dates are suggestions.

| When | Step |
|---|---|
| Now → Fri 20 Nov | Build tracks at your own pace. Native changes can merge freely until the freeze, because they all ride the 5.0.0 build |
| Fri 20 Nov | **Freeze:** native + feature freeze for 5.0.0. After this, only fixes found in QA |
| Fri 20 → Tue 24 Nov | `eas build --profile production --platform all`, then device QA on TestFlight / internal testing (O3) |
| Wed 25 Nov | `eas submit` to both stores with **manual release**: App Store "Manually release this version", Play "Managed publishing". Approval then waits for you |
| 25 Nov → 1 Dec | Buffer for review or a rejection fix plus resubmit. Record runtimes from EAS (O4). Backend changes 5.0.0 needs are deployed and backward compatible with 4.0.5 |
| **Wed 2 Dec** | **Release on both stores.** Publish a tiny 5.0.1 OTA at 20% and confirm a phone gets it (O5). Soft update prompt on (O6) |


---

## Now

| Track | Item | Status |
|---|---|---|
| S | **Backend audit found live exploits:** payment-receipt replay (S1–S3) and two account takeovers (S4–S5). Backend deploys are not tied to 2 Dec, so fix and deploy these first | next |
| O | **OTA is blocked.** `main` matches no live store build, so mobile work since 4 Oct reaches nobody until 5.0.0 is live on **2 Dec** (D6). Phase 2 guards (O7–O16) can be built now | next |
| H | White-label P1–P3 merged (#106), not deployed. **Needs you:** Cloudflare SSL for SaaS + env (H8), then deploy (H10) and verify (H11) | next |

## Suggested order

There are no dates, only a sensible sequence. Each step makes the next one cheaper.

0. **S1–S8** first: live payment and account-takeover holes. Deploy straight away; the backend isn't held to 2 Dec.
1. **S9–S16** (money races) and **S17–S22** (outage risks), then **O7–O16**, so the 5.0.0 runtime is protected from day one. **O1–O6** follow the [5.0.0 schedule](#500--release-wed-2-dec-2026). No mobile change reaches users before 2 Dec.
1. **A1–A3**: billing checkout + confirm dialogs. These are the only items that block money or trust.
2. **Track 0**: the cleanup. It removes about 10k lines with no behaviour change, so everything after it touches less code.
3. **B1–B4**: the backend features that already exist and only need a button.
4. **H**: finish white-label P1, then P2 and P3.
5. **C**: notifications (inbox first).
6. **B5+**: exports, search, paging.
7. **G**: mobile scope handoffs, then cosmos migration of what stays.
8. **D, E, F**: support, sponsors/partners, feedback.
9. New product: **L** live engagement, **K** discovery, then the rest.

---

## Tracks

### S · Backend audit (2026-10-14)

Read-only audit of `backend/` in four passes: inventory, security, money/data, reliability. S1–S5 were confirmed by hand. **Backend fixes deploy any time** (D6 only holds back the mobile store build), but they must stay compatible with 4.0.5 clients.

**P0: live exploits. Fix and deploy now.**

| # | Item | Status |
|---|---|---|
| S1 | **Payment receipt replay.** `verifyPayment` (`registrations.service.ts:4480-4611`) checks the Razorpay signature but never that `dto.razorpayOrderId === registration.orderId`, and overwrites `orderId` with the caller's. One ₹10 receipt confirms any number of ₹5,000 registrations; the waitlist-convert branch too. Fix: require the order match + `registration.eventId === eventId`; partial unique indexes on `event_registrations.payment_id` / `order_id` (also fixes the unindexed webhook lookups). Copy the pattern from `team-changes.service.ts:450` and stays `:620` | next |
| S2 | Same replay in sessions verify (`sessions.service.ts:794-840`); PAID unlocks the LiveKit join token | next |
| S3 | Subscription upgrade verify (`subscription.service.ts:197-240`): no `order.notes.spaceId === spaceId`, no payment-id dedup, `!==` signature compare. Pay once, upgrade every space, replay monthly. Fix: check space + `order.status`, unique payment id, `timingSafeEqual` | next |
| S4 | **Mass identity takeover.** `verifyTempToken` (`auth.service.ts:679`) accepts any JWT (access/refresh too). With no `provider`/`providerUserId`, Prisma drops the filters, so `verifyMobile` (`:325-350`) `findFirst({})` returns any identity and `updateMany({})` repoints **every** `user_identities` row to the caller. Fix: `type: 'temp'` claim required, reject empty provider fields, never pass possibly-undefined values into `updateMany` filters | next |
| S5 | Account takeover by email auto-link: `handleProviderLogin` (`:493-520`) and `loginWithCognito` (`:795-818`) link a new IdP identity to an existing account by email without checking `email_verified`. Fix: link only when verified, otherwise OTP to the existing email/mobile | next |
| S6 | Refresh tokens accepted as access tokens (`validateAccessToken` `:687` ignores `type`); no revocation on rotate/logout. Fix: reject non-access types; store refresh `jti` in Redis, revoke on rotate + logout, per-user `tokenVersion` | next |
| S7 | OTP brute force: non-atomic attempt counter (concurrent guesses), `Math.random()` codes, counter reset per send, `verify-mobile` unthrottled. Fix: `crypto.randomInt`, atomic `INCR` checked before compare, per-identifier send cooldown + daily cap (also stops WhatsApp OTP cost abuse) | next |
| S8 | Hardcoded App Review login `test-user@unifesto.app` / `098765` (`auth.service.ts:227`) bypasses OTP for anyone. Fix: env flag, off in production except during review | next |

**P1: money and data integrity**

| # | Item | Status |
|---|---|---|
| S9 | Cancelling an unpaid PENDING registration decrements `soldCount`/`registeredCount` it never incremented (`registrations.service.ts:5677-5734`); repeatable, so it unlocks unlimited overselling. Only decrement for PAID / PARTIALLY_REFUNDED; release the coupon | planned |
| S10 | Overselling on paid checkout, free/RSVP, import, complimentary add and restore: capacity is a plain read, increments are unconditional. Use the atomic `UPDATE … WHERE sold_count + n <= total_quantity` from `team-changes.service.ts:326` (`moveCapacity`) and auto-refund on a lost race | planned |
| S11 | Double refund: `adminDecide` (`refunds.service.ts:368-483`) calls Razorpay without claiming the request; `refundedAmount` written absolute. Claim with `updateMany where status=PENDING_ADMIN → PROCESSING`; partial unique index on open requests per registration | planned |
| S12 | Payouts: create races (compute then insert), mark-paid/cancel with no status condition (paid then cancelled frees the money again), refunds after payout hidden by `Math.max(0, …)`. Lock the event row/advisory lock around compute+insert, conditional status changes, show negative balances and flag refunds that exceed what's left | planned |
| S13 | Checkout retry hard-deletes PENDING rows that already have a live Razorpay order (`:3990-4004`), creating orphaned payments. Cancel instead, like `:362` | planned |
| S14 | Deleting a cancelled event cascade-deletes paid registrations, refund requests and stay bookings (`events.service.ts:2462`; same for sessions and space delete). `cancelEvent` promises refunds but issues none. Block delete while paid rows exist; decide the cancel-refund flow | planned |
| S15 | Smaller money bugs: partial refund removes the whole ticket from payouts (count PARTIALLY_REFUNDED minus `refundedAmount`); restore revives refunded/unpaid rows; verify/webhook revive CANCELLED or REFUNDED rows to PAID; waitlist convert and session verify double-count; `payment.failed` can overwrite PAID; session cancel refunds the fee too; coupon cap leaks (30-min release while order still payable, release/confirm race); transfer request not claimed atomically; stay late-payment refund failure leaves PAID+CANCELLED | planned |
| S16 | One fee source of truth: null `revenueSharePercent` = 0% in payouts but platform default in plan-config; export "Net" disagrees with `netEntitlement`; `computeProcessingFee` unrounded (paise drift trips reconcile). Single `resolvePlatformFeePercent` + round to paise | planned |

**P1: outage risks**

| # | Item | Status |
|---|---|---|
| S17 | Deploys recreate all 3 replicas at once while Caddy retries for 5s and boot takes up to 40s (likely the 502/503 floods). Roll one replica at a time (`docker rollout` or scale 6 → healthy → 3); `stop_grace_period: 60s` | planned |
| S18 | A Redis outage hangs every request incl. the health probe (throttler client `maxRetriesPerRequest: null` + offline queue; `GET /` not `@SkipThrottle`), so all replicas get ejected together. Own client, fail open, skip throttle on health | planned |
| S19 | Rate limits keyed to Cloudflare edge IPs (no `trusted_proxies` / `client_ip_headers` in Caddy) = 429 storms; SSR calls the public API and shares one bucket. Trust Cloudflare CIDRs + `Cf-Connecting-Ip`; SSR via `http://backend:8080` with an internal header | planned |
| S20 | Cert render OOM: canvas up to 10000², PDF+PNG in parallel each re-downloading the background, sync PNG encode blocks the loop, `reissueAllRevoked` on the request path, inline fallback when Redis is down. Cap ~3508×2480, fetch once, `await canvas.encode`, queue everything, separate `cert-worker` with its own memory limit | planned |
| S21 | Unhandled rejections kill a replica (Node 22): `void sendRegistrationConfirmations` right after payment, `void dispatch` in push campaigns. `.catch(log)` at every `void` call + a global `unhandledRejection` logger | planned |
| S22 | Recurrence cron runs on all 3 replicas, unlocked, read-then-create, so occurrences can duplicate. `runExclusive` + `@@unique([seriesParentId, startDateTime])` | planned |

**P2: hardening**

| # | Item | Status |
|---|---|---|
| S23 | Payout separation of duty: request/payout-account routes allow any Space Admin or the creator, bypassing `EVENT_MANAGE_MONEY` (`payouts.service.ts:927`). Gate on `assertCan`. Same family: certificates (`:98`) and reports (`:48`) hand-roll role checks that wrongly refuse platform admins and event curators. Move every inline `SPACE_ADMIN_ROLE_CODES` check (15 files) to `@Can` | planned |
| S24 | Member search returns any platform user's email by substring (`spaces.service.ts:759`): email harvesting. Exact match only | planned |
| S25 | Career résumés uploaded public and unthrottled (`careers.service.ts:181`). `uploadPrivate` + signed URLs + throttle | planned |
| S26 | CORS: `startsWith('http://localhost')` and http `*.unifesto.app` allowed. Exact regex, https only | planned |
| S27 | api_logs store raw paths with bearer claim tokens and spoofable IPs; one insert per request; `ILIKE` scans. Log the route template + `req.ip`, sample 2xx GETs, batch retention, better indexes | planned |
| S28 | Webhook dedup: store Razorpay event id / Meta message id unique; captured handler skips REFUNDED/CANCELLED | planned |
| S29 | Inline auth/payout body types skip validation (payout `amount: "abc"` → NaN passes guards). Real DTOs; `@Max(100)` on list `limit`s (`GET /events`, users) | planned |
| S30 | Stays `mark-paid` gated by check-in permission. Use attendee-manage or money capability | planned |
| S31 | Secrets: `JWT_SECRET` reused for email-tracking + traffic HMACs with hardcoded fallbacks; not validated at boot. Dedicated secrets; Joi/zod env schema in `ConfigModule` (JWT_SECRET, PORT, DIRECT_URL…) | planned |
| S32 | Timeouts on every outbound client: WhatsApp (8 axios calls), Razorpay, S3/SES/Resend, LiveKit | planned |
| S33 | Fan-out: event/session reminders fire every attendee at once and ignore soft-deleted events; email campaigns run in-process and stick in SENDING after a deploy; reports + exports build in memory on the request. Chunk with a limit, BullMQ campaign jobs with checkpoints + stale sweep, stream CSV | planned |
| S34 | DB: N+1s on the check-in gate path (offline sync, bulk), payouts, leaderboard upserts, `canManage`; retention for `page_views`, `push_logs`, `user_notifications`, `email_campaign_logs`, `short_link_clicks`, `whatsapp_messages`; `runExclusive` on unlocked cleanup crons | planned |
| S35 | Observability: nestjs-pino with request id from `cf-ray`, Sentry for 5xx + cron failures, drop Prisma `query` log in prod, cache `/health` 5–10s (it hits S3 every probe), delete `getPm2Logs` `execSync` | planned |
| S36 | Socket gateway: auth in `io.use`, disconnect on token expiry, 2s Redis cache for `getPublicSnapshot` (reconnect storms) | planned |
| S37 | CI lint: fail migrations containing `DROP COLUMN`/`DROP TABLE` unless marked as a contract step | planned |

**P3: cleanup and tests**

| # | Item | Status |
|---|---|---|
| S38 | Delete dead modules: `aws` (22 routes, includes the `$queryRawUnsafe` table-name injection), `roles`, `discussions` (plus mobile's orphan API fns calling a non-existent replies route; also has a pin/lock bypass via `PATCH`), `firebase` + `AdminDevice` + admin device-token routes | planned |
| S39 | Delete ~25 dead legacy leaderboard routes (`leaderboard.controller.ts`); trim `leaderboard.service.ts` method by method (hackathon shares it) | planned |
| S40 | Remove the duplicate `CategoriesModule` pasted inside `ThrottlerModule.forRootAsync` imports (`app.module.ts:72`) | planned |
| S41 | Unused deps: `googleapis`, `firebase-admin`, `bcrypt`, `docx`, passport ×4, `ws`, `@types/socket.io`, 7 AWS SDK clients (after S38); fix `ts-jest`/`jest` and `pdfkit` types mismatches | planned |
| S42 | Dormant schema: `Referral`, `referralCode`, `referralUpdates`, coins/cashback columns, `SKIPPED_MUTE`; finish GroupSeat consolidation (drop `groupMembers` fallbacks); stop writing the "do not read" WhatsApp URL fields. Contract migrations, one at a time | planned |
| S43 | Duplication: one event-access helper (8 variants today), one `isAdmin`, shared CSV util, shared admin/space email controller, `slugify` dep instead of local copy | planned |
| S44 | Stale comments: wallet/coins wording, ORGANISER role comments, done `TODO(you)` markers. Real open decision: sponsor override inheritance (`sponsors.util.ts:32`) | planned |
| S45 | Tests on the money paths, written alongside S9–S16: register → pay → cancel → refund → payout, verify/webhook race, coupon cap, capacity race. Today payouts, main refunds, core registrations, stays bookings, coupons service, events, spaces have no spec; no e2e | planned |
| S46 | Split `registrations.service.ts` (5,934 lines) into checkout, verify/webhook, cancel/restore, export services as S9–S16 touch them | planned |
| S47 | Migration hygiene: two migrations share `20260930120000`; two were committed out of timestamp order. Note it; never reuse a timestamp | planned |

**Done when:** S1–S8 are deployed; the money path has tests that fail on the S1 and S9–S12 scenarios; and a deploy no longer drops traffic.

### O · OTA updates that always reach people

**What's wrong (checked 2026-10-14):**

| Fact | Evidence |
|---|---|
| Live store builds are still 4.0.5 (iOS 39 runtime `d1776dd1…`, Android 46 `d379e9cc…`), built from `f2b204d` on 2 Oct | `eas build:list` |
| The last OTA that reached anyone was **4.1.1 on 4 Oct**. Nothing has been published since | `eas update:list --branch production` |
| `main` now fingerprints to iOS `b5b10345…` / Android `dfab2d1e…`, which matches **no** live build. Any OTA from `main` would reach nobody, and preflight refuses it | `npm run ota:preflight` |
| 76 mobile commits since `f2b204d` are stuck: every cosmos redesign, Home motion, tickets, profile, settings, manage-space and every "JS only (OTA)" fix in the log | `git log f2b204d..HEAD -- mobile/src mobile/app` |

**Why it happened:** three native changes merged into `main` among ordinary JS PRs, and each one silently changed the runtime:
1. App Clip removal (`63fd161`): dropped `@bacons/apple-targets`, the `targets/clip` target and the entitlement.
2. Alternate app icons (`83d57c2`): `expo-alternate-app-icons` plugin.
3. Haptics (`7b2992d`): `expo-haptics`. The Unicon swap also dropped `@expo/vector-icons`, `lucide-react-native` and `phosphor-react-native` from `package.json`, and the splash colour changed.

Preflight only runs at publish time. Nothing warned at merge time, so PRs kept being labelled "JS only (OTA)" after OTA had already stopped being possible. Weaker causes:
- The fingerprint also hashes `package.json` scripts.
- `update:production` still fails on the web platform and needs the `--skip-bundler` workaround.
- Runtimes are recorded by hand.
- Starting a new rollout silently made the previous one the base (seen with 4.1.0 → 4.1.1).

**Phase 1: unblock with the 5.0.0 store build (release Wed 2 Dec, see [schedule](#500--release-wed-2-dec-2026))**

Until then, the live 4.0.5 builds get **no** updates: `main` can't target their runtime. Backend changes must stay compatible with 4.0.5 clients until most users have moved.

It's a major because it removes the App Clip.

| # | Item | Status |
|---|---|---|
| O0 | **Hotfix lane until 2 Dec** (only if something is badly broken for live users): branch `hotfix/4.1` from `e87540f` (the 4.1.1 OTA commit), cherry-pick the JS-only fix, run `ota:preflight` (it passes on the 4.0.5 runtimes), and publish with the `--skip-bundler` recipe. Never merge `hotfix/4.1` back into `main`; land the same fix on `main` separately | standby |
| O1 | Batch in fingerprint fixes that need a store build anyway: `platforms: ["ios", "android"]` in `app.config.js` (makes `npm run update:production` work and retires `--skip-bundler`), and `sourceSkips: SourceSkips.PackageJsonScriptsAll` in `fingerprint.config.js` (editing npm scripts never changes the runtime again). Pull in any other native work wanted soon, such as C7 rich push, or consciously leave it for the next window. Land before the 20 Nov freeze | planned |
| O2 | Version → 5.0.0; `eas build --profile production --platform all` from `main` after the 20 Nov freeze | planned |
| O3 | Device QA on TestFlight / internal testing. This is the first time 76 commits run on a phone. Smoke-test login, Home, event → register free + paid, ticket + QR, group claim, check-in scanner (online + offline), Space tab manage screens, Apex tab, app icon picker, haptics, light/dark, push + deep link | planned |
| O4 | Record runtimes **from EAS metadata** (`eas build:list --json` → `runtime.version`), not `ota:record`, which hashes the local tree. Keep the 4.0.5 entries until O6 | planned |
| O5 | `eas submit` on 25 Nov with manual release; release on **2 Dec**, then publish a tiny 5.0.1 OTA at 20% and confirm a real phone receives it (Profile › About shows the update id) | planned |
| O6 | Move people off the 4.0.x runtimes, which can never get another OTA. Show a soft update prompt as soon as 5.0.0 is live on both stores, then raise the minimum version to 5.0.0 once most active users have moved (decision for you: how long between soft and hard) | planned |

**Phase 2: make it impossible to repeat**

| # | Item | Status |
|---|---|---|
| O7 | **CI "OTA-safe" check** on every PR touching `mobile/`: run preflight with `GOOGLE_MAPS_ANDROID_API_KEY` as a GitHub secret (the only env var feeding the config). If the PR's head no longer matches a live runtime while its base did, the check fails with "native change: needs a store build" | planned |
| O8 | **Native PR rule (from 2 Dec on):** PRs that change the runtime get a `native` label and stay open until the next store-build window, when they merge together right before the build. JS PRs never wait. Before 2 Dec, native PRs merge normally into the 5.0.0 build. All PRs still base on `main` | planned |
| O9 | PR template: replace the free-text "Ships as" with the CI result (OTA-safe ✓ / store build) | planned |
| O10 | `scripts/ota-record-build.js`: fetch the latest finished production build per platform from EAS and write its runtime to `runtime-fingerprints.json`. Delete `ota:record` | planned |
| O11 | Make `update:production` refuse to publish while another rollout on the channel is below 100%. Promote it or revert it first, so one rollout runs at a time | planned |
| O12 | **Stale-OTA alarm:** Apex › OTA updates shows how many mobile commits on `main` are newer than the last published update, plus whether `main` is OTA-safe. That makes "nothing shipped for 10 days" visible | planned |
| O13 | **Adoption:** add `runtimeVersion` + `updateId` to the app-version report (`src/lib/appVersionReport.ts` sends only version + platform today) and a backend column, so Apex shows the share of active users on each update and runtime | planned |
| O14 | Test promote / revert / republish on the `preview` channel once, with an internal preview build. The Apex mutations are still untested. Use the preview channel to QA risky OTAs before production | planned |
| O15 | Publish habit: OTA whenever a batch of mobile PRs has merged and been checked on a device. Don't let JS sit on `main` unshipped | planned |
| O16 | Rewrite `mobile/docs/OTA.md` for the new flow (drop the `--skip-bundler` section, add the native-window rule, record-from-EAS and the one-rollout rule) | planned |

**Done when:** a phone on the latest store build receives every OTA published from `main`; CI has flagged at least one native PR; and Apex shows update adoption.

### 0 · Clean house (removes leftovers)

From the audit: dead and pre-pivot code across all three apps. Zero behaviour change apart from removing unreachable routes.

| # | Item | Status |
|---|---|---|
| 0.1 | Apex: delete orphan pre-pivot pages `billing/`, `settlements/`, `spaces/request/`, `events/new/` (broken for admins: needs `currentSpace`) | done (#108) |
| 0.2 | Apex: strip organiser branches from `spaces/page.tsx` (`loadMine`), `spaces/[id]` (`OrganiserHierarchyPanel`, parent-organiser mode), `payouts` (`getMyPayouts`), `refunds` (curator queue), `support` (`NewTicketForm`, own-ticket close); then `currentSpace` in `SessionContext`, the `space_admin` path, redundant "Admins only" guards (plans, status, subscriptions, logs) | done (#108) |
| 0.3 | Apex: delete dead components `CertificateDesigner`, `ticket-editor`, `EventContentSections`, `SectionEditor`; dead API modules `certificates-api`, `leaderboard-api`, `reports-api`, `sessions-api`, `waitlist-api`, unused parts of `events-api`/`registrations-api`; `lib/hack.ts`; `hasLeaderboard` in plans; unused nav icons | done (#108) |
| 0.4 | Space: delete redirect-only routes `payouts/`, `refunds/`, `bank-account/`, and the copied admin functions never called in `payouts-api`, `refunds-api`, `requests-api`, `spaces-api`, `white-label-api`, `categories-api`, `registrations-api` | done (#108) |
| 0.5 | Mobile: delete `SettingsScreen.tsx`, `App.tsx`, `index.ts`, `src/navigation/*.ts.old`, `GlassyButton`, `GradientText`, `Footer`, `PasscodeInput`, `StepIndicator`, `RegistrationTimer`, `PocketWordmark`, `useRegistrationPayment`, `utils/iconMapper.ts`, `lib/spacesPlaceholder.ts`, `lib/api/device.ts`, `eventHelpers.ts`, `deepLinking.ts`, unused `constants.ts` exports; routes `spaces-list`, `signup`, `seats/[registrationId]`; stale wallet/coins comments | done (#108) |
| 0.6 | Backend: legacy non-hackathon routes in `leaderboard/leaderboard.controller.ts` (rounds, metrics, panelists, awards). **Careful:** the hackathon services live in the same folder; delete only the controller routes with no callers | done (#107) |
| 0.7 | Backend: referral and wallet leftovers (dormant tables decided separately) | done (#107) |
| 0.8 | Close the open `TODO(you)` decisions: Space detail join CTA (`SpaceDetailScreen.tsx:416`), Space tab `summaryLine` (`SpaceScreen.tsx:249`), Apex edit-user empty fields (`AdminEditUserScreen.tsx:50`), request ordering (`apexRequests.ts:160`), `pushDeviceReport.shouldReport()`, stale TODO in `appVersionReport.ts` and space `useDrawerBehavior.tsx` | done (#108) |

### A · Money and trust

| # | Item | Status |
|---|---|---|
| A1 | **Space plan upgrade checkout**: wire Razorpay checkout + `verifySpaceUpgrade` (`websites/space/.../billing/page.tsx:117-161` stops at "not wired up yet") | next |
| A2 | Apex confirm dialogs on irreversible actions: orphaned-payment `attach()`, request approve/reject, IAM grant toggle, subscription override, WhatsApp send-to-all, event publish/hide | next |
| A3 | Settle money TODOs: Space transactions net formula (`transactions/page.tsx:136`), Apex financials default sort (`financials/page.tsx:79`) | planned |
| A4 | Money-path review end to end: payments, refunds, payouts, reconciliation; webhook idempotency (from W1) | planned |
| A5 | Platform ledger: every fee, refund, payout and gateway charge as ledger entries; monthly close report (from W9) | planned |
| A6 | GST tax invoices for platform fees, GSTR-ready monthly export; TDS/TCS check with CA (from W9) | planned |
| A7 | Revenue analytics in Apex: GMV, net revenue, take rate per space/month, cohorts (from W9) | planned |
| A8 | Zoho Books monthly revenue sync + runway/burn summary (D4) | planned |

### B · Operator productivity

| # | Item | Status |
|---|---|---|
| B1 | **Announce to attendees** button on Space event page (backend `POST /events/:eventId/announcements` exists, no UI) | next |
| B2 | Bulk check-in in Space (`POST /checkin/event/:id/bulk` + client `registrations-api.ts:850` exist) | next |
| B3 | Session edit after create in Space (`updateSession` exists) | next |
| B4 | Team-change window toggle (`PATCH /events/:eventId/attendee-controls`) in event settings | planned |
| B5 | CSV export. Space: members, rsvps, waitlist, coupon redemptions, check-in log. Apex: transactions, payouts, financials, users | planned |
| B6 | Search + pagination. Space: rsvps, coupons, sponsors roster, leads, email, sessions, waitlist, hackathon teams, payouts. Apex: content reports, request queues, support, orphaned payments | planned |
| B7 | Apex: one tabbed request inbox replacing 7 queues (mobile `queue/[kind]` pattern) | planned |
| B8 | Apex web: OTA, default images, stats recipients, system health, seat-count reconcile (mobile-only or backend-only today) | planned |
| B9 | Subspace link requests from Space (`createSubSpaceRequest` unused) | planned |
| B10 | Discussion moderation (pin, lock, delete) in Space + Apex | planned |
| B11 | Support stats header (`GET /support/tickets/stats`) | planned |

### C · Notifications

| # | Item | Status |
|---|---|---|
| C1 | **In-app notification inbox** (bell on Home), read/unread, backed by a delivery log | next |
| C2 | One `notify(user, event, data)` orchestrator: channel by preference + category, fallback push → WhatsApp → email by criticality (from W4) | planned |
| C3 | Delivery log per message (queued/sent/delivered/opened/failed, provider id), retries, dedup keys | planned |
| C4 | Preferences: category × channel grid, quiet hours (IST), transactional vs marketing split | planned |
| C5 | Provider webhooks: SES bounces/complaints → suppress, WhatsApp status, OneSignal delivery | planned |
| C6 | Apex per-user message history + failure dashboard | planned |
| C7 | Native (store build): iOS Notification Service Extension for images, push action buttons | planned |

### D · Support complete (from 4.2.0)

| # | Item | Status |
|---|---|---|
| D1 | Push + email on new ticket, reply, status change (both directions) | planned |
| D2 | Attachments via `StorageService` | planned |
| D3 | Optional event/registration context on tickets; "Get help" from ticket detail, pre-filled | planned |
| D4 | Unread state (per-side `lastReadAt`) + badges | planned |
| D5 | Organiser inbox in Space web + mobile, escalate to Unifesto (decision D2) | planned |
| D6 | Canned replies, first-response/resolution time, SLA by priority | planned |
| D7 | Auto-close resolved after 7 days, satisfaction rating | planned |
| D8 | `unifesto.app/help` contact form creates a ticket | planned |

### E · Sponsors, partners, hackathon (from 4.3.0)

| # | Item | Status |
|---|---|---|
| E1 | Shared collaborator invite: email → find-or-create → invite → claim on first login | planned |
| E2 | Space web `/partner` portal modelled on `/sponsor`; landing routes sponsor/partner-only users to their portal | planned |
| E3 | Sponsor portal: lead notes + status, per-event booth stats | planned |
| E4 | Partner: multiple links, share kit (tracked link + QR) | planned |
| E5 | Hackathon submissions (title, repo, demo, deck) with per-round deadline; judges see them while scoring | planned |
| E6 | Hackathon certificates from awards | planned |
| E7 | Offline queue for BoothScan + StayScan, reusing `src/lib/offline/checkinQueue.ts` | planned |

### F · Feedback and user IAM (from 4.4.0)

| # | Item | Status |
|---|---|---|
| F1 | Event feedback: per-event form (rating 1–5, NPS, organiser questions using registration question types), one response per attendee | planned |
| F2 | Trigger to checked-in attendees 2 h after end, reminder at 48 h, closes at 7 days; optional "feedback unlocks certificate" | planned |
| F3 | Results in Space web + mobile (averages, NPS, distribution, comments, CSV); opt-in public rating at N ≥ 5 | planned |
| F4 | User IAM: suspend/ban with reason + expiry, force logout (revoke refresh tokens), per-user capability overrides | planned |
| F5 | Audit trail for permission, role, status, plan and reconcile changes, shown on Apex entity detail | planned |
| F6 | Apex user detail: their registrations and payments | planned |
| F7 | In-app "What's new" sheet after an OTA applies | planned |

### G · Mobile scope, design and performance

| # | Item | Status |
|---|---|---|
| G1 | "Open on web" handoffs (deep link) for desk work on mobile: event/ticket/coupon/question editors, series dates, sub-events, co-hosting, content editors, stay editors, CSV import, hackathon setup (settings, themes, statements, rounds, criteria, panels, judges, awards, certificates), white-label, billing, payout accounts; Apex blog, careers, categories, email compose/templates, plans, subscriptions, IAM, reconciliation, logs, default images | planned |
| G2 | Keep on mobile and polish: check-in (online + offline), scanners, attendee actions, waitlist offers, hackathon queues/rooms/announce/help-desk, judging, leads, refund approve, support, WhatsApp inbox, request review, status, OTA | planned |
| G3 | Cosmos migration in order: manage-event subtree → check-in → attendee leftovers (registration success, claim, group, refund, sessions, live session, stays, edit details) → hackathon/judging → Apex. About 115 screens | planned |
| G4 | Long lists → `FlatList`: Waitlist, ManualCheckin results, HackathonTeams, Queues, Results, Leads, Coupons, `sessions.tsx`, `group/[registrationId]` | planned |
| G5 | Space web page pattern: Stays pages on `PageHeader`/`EmptyState`; `EmptyState` on attendees, checkin, transactions, tracking, IAM, settings | planned |
| G6 | Remaining web → mobile parity, on-site parts only: certificates issue, reports view, sessions list | planned |
| G7 | Unicon: redraw glyphs in our own style, tab bar + Home first | planned |
| G8 | Organiser "event day" mode on mobile: one cockpit with live check-in count, today's revenue, announce, help-desk queue | planned |

### H · White-label, the big version

Goal: a space on a branding plan can make Unifesto disappear: own domain, logo, colours, email address, all self-serve.

**Decisions**
- Plan-gated and self-serve. `hasRemoveBranding` + the existing `space:manage-settings` capability (no new one). No more request → approve; platform admins can **suspend** (`brandingSuspendedAt`). `POST /white-label/requests` stays only for shipped mobile builds and now enables instantly; old PENDING rows can still be approved in Apex History.
- The space is the brand. Events inherit the space theme, and an event can override only its accent.
- One domain model: `SpaceDomain {hostname, kind: WEB|EMAIL, status, provider ids, dns records}`, verified before use.
- Web domains via **Cloudflare for SaaS** (customer CNAMEs to `domains.unifesto.app`; first 100 free, then $0.10/month each).
- Email domains via the **Resend Domains API** (DKIM/SPF). Mail is sent from `tickets@<their domain>`, falling back to the Unifesto address until verified.

| # | Item | Status |
|---|---|---|
| H1 | P1 migration `20261014120000_white_label_theme`: `brandFont`, `brandMode`, `hidePoweredBy`, `brandingSuspendedAt` (`brandLogoUrl` revived) | done, not deployed |
| H2 | P1 `branding.util` resolvers (on && plan && !suspended; payload adds name/logo/font/mode/hidePoweredBy, 5-test spec); `/white-label` routes self-serve via `@Can`; logo/favicon upload; admin suspend; private brand fields stripped from public space payloads | done, not deployed |
| H3 | P1 web: `components/BrandedChrome.tsx` replaces Navbar/Footer on space + event pages when the space theme is live; Google font + forced light/dark | done, not visually verified |
| H4 | P1 Space Branding studio (all fields + uploads + live preview + event colours + upsell) done; Apex Manage page Suspend/Restore done; mobile manage card self-serve copy done. Mobile logo on space/event screens still open | in progress |
| H5 | P2 branded email layout (logo/name header, accent buttons, "Sent by X via Unifesto") on all 12 attendee templates; `EmailService.brandFor(eventId)` resolves theme + sender centrally | done, not deployed (#106) |
| H6 | P2 `SpaceDomain` (migration `20261014140000_space_domains`) + Resend Domains add/verify/remove + studio card; mail sends from `<local>@<verified domain>` | done, not deployed (#106) |
| H7 | P3 custom web domains: Cloudflare custom hostnames add/verify/remove, public `GET /white-label/domains/resolve`, Caddy catch-all, web middleware tenant routing (+ `scripts/middleware.check.mts`), per-host canonical/OG, emails link to the custom domain | done, not deployed (#106) |
| H8 | **Needs you:** enable SSL for SaaS on the zone, create fallback origin `domains.unifesto.app`, API token → `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN`; check the Resend plan's domain limit | planned; also confirm Full (strict) TLS works for custom hostnames with the `*.unifesto.app` origin cert |
| H9 | Bring-your-own WhatsApp sender per space (today it's one env number) | planned |
| H10 | Deploy #106: read migrations `20261014120000_white_label_theme` + `20261014140000_space_domains`, `migrate deploy`, rebuild backend + web + space + apex, Caddy reload, mobile OTA (manage-card copy) | planned |
| H11 | Verify after deploy: branded space + event page (header/footer, font, forced mode), Branding studio uploads + preview, a branded registration email in Gmail + Apple Mail (light/dark), suspend/restore from Apex. None of this was seen rendered | planned |
| H12 | Mobile: show the space logo (`branding.logoUrl`) on space + event screens; consider `branding.font` | planned |
| H13 | Web "Add to calendar" (`lib/calendar.ts`) and share links use the space's custom domain when it has one | planned |
| H14 | Certificate emails go via SES, so they can't use a space's custom sending address (name + reply-to only). Verify the domain in SES too, or move certificate mail to Resend | planned |
| H15 | Retire the legacy request flow once no shipped mobile build calls it: `POST /white-label/requests`, Apex White-label History, mobile request copy, then drop `white_label_requests` | planned |
| H16 | Space app `Capability` type has no `space:manage-settings`, so the Branding nav item gates on `manage-billing` (backend enforces manage-settings). Add the capability to the space RBAC types | planned |
| H17 | Font presets are duplicated in `backend/src/white-label/branding.util.ts` and `websites/space/lib/api/white-label-api.ts`; serve them from the overview endpoint instead | planned |
| H18 | Custom-host lookup is cached 60s per web process, so a suspension or removal takes up to a minute to take effect. Fine for now; shorten or invalidate if that matters | parked |

### I · Legal (from W6)

Drafts need a human lawyer's sign-off before publishing.

| # | Item | Status |
|---|---|---|
| I1 | Terms (attendees), Organiser/Space Agreement, Privacy Policy (DPDP 2023), Refund & Cancellation, Acceptable Use, Sponsor & Partner terms, Cookie Policy, Grievance page (IT Rules 2021) | planned |
| I2 | Versioned legal documents with acceptance per user; re-acceptance on next launch on every client | planned |
| I3 | DPDP erasure on account close (#41): needs backend rebuild | in progress |
| I4 | Privacy Policy retention line for erased question answers, once I1 + I3 land | planned |

### J · Scale and reliability (from W1/W2)

This was cut down from the v4 EKS plan. Do the cheap wins first, and only move to EKS when traffic needs it.

| # | Item | Status |
|---|---|---|
| J1 | → S4–S8, S23–S31 (audit done). Endpoint guard audit (all routes vs `@Can`/guards), input validation, per-route rate limits | planned |
| J2 | → S21, S22, S34 (audit done). Silent catches, cron jobs safe with multiple replicas (single-runner locks), graceful shutdown | planned |
| J3 | → S1, S34 (audit done). Missing indexes, N+1s, unbounded `findMany` | planned |
| J4 | → S35 (audit done). Structured logs + request ids + error alerting; deeper `/health` | planned |
| J5 | → S20, S33 (audit done). Queue heavy work (email, push fan-out, PDF/cert rendering) off the request path | planned |
| J6 | k6 scripts for real peaks (event page, OTP login, checkout, check-in, leaderboard); baseline on a staging copy | planned |
| J7 | Autoscaling (EKS + ALB, Terraform + Helm, Secrets Manager, PgBouncer, Redis, CI/CD replacing `deploy.sh`) | parked: only when J6 shows the current host can't take the peak |

### K · Growth and discovery

| # | Item | Status |
|---|---|---|
| K1 | Discovery marketplace on web + mobile: browse by city/college/category, "trending near you" | planned |
| K2 | SEO: sitemap (events, spaces, blog, careers), JSON-LD (Event, Article, JobPosting), RSS, canonicals (from W7) | planned |
| K3 | Blog: authors, tags, scheduled publish, OG image, reading time, related posts | planned |
| K4 | Careers: application form with private resume upload + applicant pipeline in Apex | planned |
| K5 | Tracked short links on the apex domain + QR; country in click tracking (from W10) | in progress |
| K6 | Web referrer capture rolled up by domain; Search Console backlink import, weekly | planned |
| K7 | Help articles + legal pages managed in Apex | planned |

### L · Live engagement (new)

The biggest product gap versus KonfHub. It keeps attendees in the app *during* the event.

| # | Item | Status |
|---|---|---|
| L1 | Live polls (organiser launches from mobile event-day mode, attendees vote on ticket screen) | planned |
| L2 | Q&A with upvotes + moderation, per session/track | planned |
| L3 | Quizzes with a live leaderboard (reuse hackathon leaderboard sockets) | planned |
| L4 | Projector view on web (results, Q&A wall) | planned |

### M · AI assists (new)

| # | Item | Status |
|---|---|---|
| M1 | Draft event description, agenda and FAQs from a few lines or an imported link | planned |
| M2 | Email/WhatsApp copy suggestions in campaigns | planned |
| M3 | Post-event report summary (attendance, revenue, feedback themes) | planned |
| M4 | "Who to nudge": past attendees likely to register, for a curator-approved campaign | planned |

### N · On-site (new)

| # | Item | Status |
|---|---|---|
| N1 | Badge/pass printing (PDF sheets + label printers) from the roster | planned |
| N2 | Kiosk self check-in (tablet mode: scan or search your name) | planned |
| N3 | Attendee networking: opt-in "who's going" + connect requests at hackathons and fests | planned |

### Parked and dropped

| Item | Status | Why |
|---|---|---|
| Project management system inside Apex (v4 W8) | parked | It's a whole product. Use an off-the-shelf tool until the team outgrows it. |
| Stays: new features | parked | Niche. Check real booking counts before investing; keep it working. |
| White-label request queue | dropped | Replaced by plan-gated self-serve + suspend (H). |
| App Clip | dropped | Removed 2026-10-08. |
| Wallet, referral, event chat, hack app | dropped | Removed in v4. Only cleanup remains (Track 0). |
| Multi-currency / international payments | parked | Only when expanding beyond India. |
| Merge low-value Space pages: white-label → Settings, partners → Tracking, occurrences/sub-events/co-hosting behind "Advanced" | planned | From the audit; do it alongside H and G. |

---

## Releases

| Version | Date | Ships as | What | Build / OTA id |
|---|---|---|---|---|
| _none yet_ | | | | |

## Log

- **2026-10-14** · Version 5 plan created from the product audit of Space web, Apex web and Mobile, plus every open item from version 4. Old version and plan docs removed.
- **2026-10-14** · H1–H3 built, H4 mostly, on `claude/white-label-big`. Backend tsc + jest green; web, space, apex, mobile tsc green. Deploy: `migrate deploy`, rebuild backend + web + space + apex, mobile OTA.
- **2026-10-14** · H5 + H6 (P2) built, pushed to #106. Full backend suite 529/529.
- **2026-10-14** · H7 (P3) built, pushed to #106. Backend 536/536, middleware check passes. Needs H8 before it works in prod.
- **2026-10-14** · Leftovers from #106 logged as H10–H18.
- **2026-10-14** · #106 merged to main (66805bf), CI green. H1–H7 done, not deployed.
- **2026-10-14** · OTA found blocked: `main` matches no live runtime (native changes: App Clip removal, alternate icons, haptics), and no OTA has shipped since 4.1.1 on 4 Oct. Track O added; the fix is a 5.0.0 store build, then CI guards.
- **2026-10-14** · Release date set: 5.0.0 goes live on both stores **Wed 2 Dec 2026**, no store release before then (D6). Freeze 20 Nov, submit 25 Nov with manual release.
- **2026-10-14** · Backend audit (inventory, security, money/data, reliability) added as Track S. Live: payment-receipt replay (S1–S3) and identity takeover (S4–S5), confirmed in code.
- **2026-10-14** · Track 0.6 + 0.7 (backend: 24 legacy leaderboard routes, referral/wallet leftovers) merged in #107.
- **2026-10-14** · Track 0.1–0.5 (Apex pre-pivot pages/organiser branches, Space redirect routes + copied admin API fns, mobile dead screens/components/routes) + leaderboard `manage` route: #108. tsc green on all apps, backend jest green. Mobile is JS-only; `/signup` links now map to `/login` in `+native-intent.tsx`.
- **2026-10-14** · Track 0.8 closed in #108: Space join bar hidden for members; Space tab summary "N check-ins live · M events coming up"; Apex edit-user sends null for cleared optional fields (name/username can't be cleared); Apex requests "All" orders open by oldest waiting, history by most recent; push-device report only on user/subscription/opt-in change or every 24h. Track 0 done.
