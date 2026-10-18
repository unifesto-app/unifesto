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
| D2 | Support routing: **organiser first**. Event questions go to the space inbox, which can escalate. Unifesto handles account, payment and app issues and sees everything. Every support item (questions, refunds, cancellations, requests, reports, privacy, grievance) is one Assist case. See [Track D](#d--unifesto-assist-support-system). |
| D3 | Mobile scope: **on-site and time-critical work lives on mobile, desk work lives on web.** Mobile authoring screens get an "Open on web" handoff instead of new features. See [Track G](#g--mobile-scope-design-and-performance). |
| D4 | Company books in Zoho Books. Apex pushes monthly platform revenue through its API. |
| D5 | Load testing never touches production. Use a staging copy only. |
| D6 | **No store release before Wed 2 Dec 2026.** 5.0.0 is the next store build and goes live on both stores that day. Whatever is done and device-QA'd by the freeze ships in it; the rest waits for 5.x. |
| D7 | **AI in Assist suggests, never decides.** Claude Haiku 5.5 (`claude-haiku-5-5`) answers, triages, drafts and summarises; it never moves money, approves a request or sends a reply on its own. Any refusal or API error falls back to a human queue. |
| D8 | **Plan, deal and role are three separate things.** Plan = what a space can do (features, limits). Deal = what it pays (plan price, buyer fee, organiser fee), per space or per event, versioned. Role = who can do it. Every paid row snapshots the terms it was sold under, so changing a deal never rewrites past money. See [Track T](#t--deals-billing-and-access). |
| D9 | **Space Admin and Curator both move event money** (payouts, refund approvals). Money lands in the space's bank account, so Space Admins get it officially; Co-Curator and Crew never do. |
| D10 | **Organiser platform fee rates live in `plan_configs.platformFeePercent`** (Starter 2.5, Pro 1.5, Enterprise 1). The backend, the A21 fee trigger and `/pricing` all read that column; Apex Plans edits it. A rate change only affects new sales (A21). GROWTH is retired and pays Starter's rate. When the launch offer ends on 31 Mar 2027, an admin edits the rates. See [A9](#a--money-and-trust). |
| D11 | **Buyer fee stays 5%, capped at ₹99 per ticket; organisers can absorb it per event.** Copy says what students pay and what organisers keep, never "lowest fee". Unifesto isn't GST-registered yet: when it registers, the CA decides whether GST sits inside or on top of both fees, and whether Unifesto counts as an e-commerce operator (compulsory registration, TCS). See [A12](#a--money-and-trust). |

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
| J, T, A, K, D, O | **Platform audit 2026-10-18 turned into the NEXT batch.** J13 deploy gate first, then T1, J8–J12, A19, A24, A25 and T8's hotfix with the next backend deploy; K8–K10 on web; D29 daily until the support (217 open) and WhatsApp (121 unread) backlog is clear; O17 before the 20 Nov freeze. Track S shipped on 2026-10-16 | next |
| O | Guards merged (#109), secrets + `native` label done. OTA stays blocked until 5.0.0 on **2 Dec** (D6); `update:production` now refuses until the 5.0.0 runtime is recorded. Left: deploy #109 migrations + Apex with the S deploy, compare CI fingerprint once with `eas fingerprint:compare`, then O2–O5 on the [schedule](#500--release-wed-2-dec-2026) | next |
| H | White-label P1–P3 live since the 14 Oct deploy, verified 16 Oct (H8, H10, H11 done). #146 (H12, H22, H24) waits for the next deploy. Left: H25 fixes, H14, H15, H20 (Resend plan), H23 decision | next |
| P | Marketing to 5.0.0: "What is Unifesto?" is live (P0). Next: accounts, templates, baseline, content bank (P1–P4), W1 video Tue 20 Oct | next |

## Suggested order

There are no dates, only a sensible sequence. Each step makes the next one cheaper.

1. **J13** first: deploy only CI-green `main` with a rollback image. Then the 2026-10-18 audit batch with the next backend deploy: **T1**, **J8–J12**, **A19**, **A24**, **A25** and **T8**'s hotfix. Track S shipped in the 2026-10-16 deploy.
2. **O1–O6** on the [5.0.0 schedule](#500--release-wed-2-dec-2026) (O7–O16 guards are merged). No mobile change reaches users before 2 Dec.
3. **T4–T6** before any custom client deal is signed, then **T7–T9**. T8 includes A1's checkout.
4. Growth blockers on web: **K8** (past and live events in public lists), **K9** (event page fixes, remove the fake /docs page), **K10** (register and pay on the web). **D29** daily until the support and WhatsApp backlog is clear. **O17** and every mobile item meant for 5.0.0 merged by the Fri 20 Nov freeze.
5. **A21** (freeze the fee per sale) before **A9** (organiser platform fee), then **A26–A32**: the rest of money and trust.
6. **B4**: the last backend feature that only needs a button.
7. **H**: H25 fixes, then H14, H15, H20.
8. **C**: notifications (C8 consent before any marketing send).
9. **B5+**: exports, search, paging.
10. **G**: mobile scope handoffs, then cosmos migration of what stays.
11. **D, E, F**: Unifesto Assist (support), sponsors/partners, feedback.
12. New product: **L** live engagement, **K** discovery, then the rest.

---

## Tracks

### S · Backend audit (2026-10-14)

Read-only audit of `backend/` in four passes: inventory, security, money/data, reliability. S1–S5 were confirmed by hand. **All deployed: #110 on 2026-10-14, #156–#159 on 2026-10-16.** Backend fixes deploy any time (D6 only holds back the mobile store build), but they must stay compatible with 4.0.5 clients.

**P0: live exploits. Fix and deploy now.**

| # | Item | Status |
|---|---|---|
| S1 | **Payment receipt replay in verifyPayment.** `verifyPayment` (`registrations.service.ts:4480-4611`) checks the Razorpay signature but never that `dto.razorpayOrderId === registration.orderId`, and overwrites `orderId` with the caller's. One ₹10 receipt confirms any number of ₹5,000 registrations; the waitlist-convert branch too. Fix: require the order match + `registration.eventId === eventId`; partial unique indexes on `event_registrations.payment_id` / `order_id` (also fixes the unindexed webhook lookups). Copy the pattern from `team-changes.service.ts:450` and stays `:620` | done (#110), deployed |
| S2 | **Payment replay in sessions verify.** Same replay in sessions verify (`sessions.service.ts:794-840`); PAID unlocks the LiveKit join token | done (#110), deployed |
| S3 | **Subscription upgrade verify replay.** Subscription upgrade verify (`subscription.service.ts:197-240`): no `order.notes.spaceId === spaceId`, no payment-id dedup, `!==` signature compare. Pay once, upgrade every space, replay monthly. Fix: check space + `order.status`, unique payment id, `timingSafeEqual` | done (#110), deployed |
| S4 | **Mass identity takeover via verifyTempToken.** `verifyTempToken` (`auth.service.ts:679`) accepts any JWT (access/refresh too). With no `provider`/`providerUserId`, Prisma drops the filters, so `verifyMobile` (`:325-350`) `findFirst({})` returns any identity and `updateMany({})` repoints **every** `user_identities` row to the caller. Fix: `type: 'temp'` claim required, reject empty provider fields, never pass possibly-undefined values into `updateMany` filters | done (#110), deployed |
| S5 | **Account takeover via unverified email auto-link.** Account takeover by email auto-link: `handleProviderLogin` (`:493-520`) and `loginWithCognito` (`:795-818`) link a new IdP identity to an existing account by email without checking `email_verified`. Fix: link only when verified, otherwise OTP to the existing email/mobile | done (#110), deployed |
| S6 | **Refresh tokens accepted as access tokens.** Refresh tokens accepted as access tokens (`validateAccessToken` `:687` ignores `type`); no revocation on rotate/logout. Fix: reject non-access types; store refresh `jti` in Redis, revoke on rotate + logout, per-user `tokenVersion` | done (#110), deployed |
| S7 | **OTP brute force hardening.** OTP brute force: non-atomic attempt counter (concurrent guesses), `Math.random()` codes, counter reset per send, `verify-mobile` unthrottled. Fix: `crypto.randomInt`, atomic `INCR` checked before compare, per-identifier send cooldown + daily cap (also stops WhatsApp OTP cost abuse) | done (#110), deployed |
| S8 | **Hardcoded App Review login bypasses OTP.** Hardcoded App Review login `test-user@unifesto.app` / `098765` (`auth.service.ts:227`) bypasses OTP for anyone. Fix: env flag, off in production except during review | done (#110), deployed |

**P1: money and data integrity**

| # | Item | Status |
|---|---|---|
| S9 | **Cancelling unpaid registration corrupts sold counts.** Cancelling an unpaid PENDING registration decrements `soldCount`/`registeredCount` it never incremented (`registrations.service.ts:5677-5734`); repeatable, so it unlocks unlimited overselling. Only decrement for PAID / PARTIALLY_REFUNDED; release the coupon | done (#110), deployed |
| S10 | **Overselling across checkout and add paths.** Overselling on paid checkout, free/RSVP, import, complimentary add and restore: capacity is a plain read, increments are unconditional. Use the atomic `UPDATE … WHERE sold_count + n <= total_quantity` from `team-changes.service.ts:326` (`moveCapacity`) and auto-refund on a lost race | done (#110), deployed |
| S11 | **Double refund in admin refund decision.** Double refund: `adminDecide` (`refunds.service.ts:368-483`) calls Razorpay without claiming the request; `refundedAmount` written absolute. Claim with `updateMany where status=PENDING_ADMIN → PROCESSING`; partial unique index on open requests per registration | done (#110), deployed |
| S12 | **Payout races and unguarded status changes.** Payouts: create races (compute then insert), mark-paid/cancel with no status condition (paid then cancelled frees the money again), refunds after payout hidden by `Math.max(0, …)`. Lock the event row/advisory lock around compute+insert, conditional status changes, show negative balances and flag refunds that exceed what's left | done (#110), deployed |
| S13 | **Checkout retry orphans live Razorpay payments.** Checkout retry hard-deletes PENDING rows that already have a live Razorpay order (`:3990-4004`), creating orphaned payments. Cancel instead, like `:362` | done (#110), deployed |
| S14 | **Event delete cascades paid data; cancel refunds.** Deleting a cancelled event cascade-deletes paid registrations, refund requests and stay bookings (`events.service.ts:2462`; same for sessions and space delete). `cancelEvent` promises refunds but issues none. Block delete while paid rows exist; decide the cancel-refund flow | done: delete blocked while paid rows exist (#110), deployed; `cancelEvent` refunds moved to D6 |
| S15 | **Smaller money bugs across refunds and payments.** Smaller money bugs: partial refund removes the whole ticket from payouts (count PARTIALLY_REFUNDED minus `refundedAmount`); restore revives refunded/unpaid rows; verify/webhook revive CANCELLED or REFUNDED rows to PAID; waitlist convert and session verify double-count; `payment.failed` can overwrite PAID; session cancel refunds the fee too; coupon cap leaks (30-min release while order still payable, release/confirm race); transfer request not claimed atomically; stay late-payment refund failure leaves PAID+CANCELLED | done (#110), deployed |
| S16 | **One platform fee source of truth.** One fee source of truth: null `revenueSharePercent` = 0% in payouts but platform default in plan-config; export "Net" disagrees with `netEntitlement`; `computeProcessingFee` unrounded (paise drift trips reconcile). Single `resolvePlatformFeePercent` + round to paise | done (#110), deployed |

**P1: outage risks**

| # | Item | Status |
|---|---|---|
| S17 | **Roll deploys one replica at a time.** Deploys recreate all 3 replicas at once while Caddy retries for 5s and boot takes up to 40s (likely the 502/503 floods). Roll one replica at a time (`docker rollout` or scale 6 → healthy → 3); `stop_grace_period: 60s` | done (#110), deployed |
| S18 | **Redis outage hangs every request.** A Redis outage hangs every request incl. the health probe (throttler client `maxRetriesPerRequest: null` + offline queue; `GET /` not `@SkipThrottle`), so all replicas get ejected together. Own client, fail open, skip throttle on health | done (#110), deployed |
| S19 | **Rate limits keyed to Cloudflare edge IPs.** Rate limits keyed to Cloudflare edge IPs (no `trusted_proxies` / `client_ip_headers` in Caddy) = 429 storms; SSR calls the public API and shares one bucket. Trust Cloudflare CIDRs + `Cf-Connecting-Ip`; SSR via `http://backend:8080` with an internal header | done (#110), deployed |
| S20 | **Certificate render out-of-memory crashes.** Cert render OOM: canvas up to 10000², PDF+PNG in parallel each re-downloading the background, sync PNG encode blocks the loop, `reissueAllRevoked` on the request path, inline fallback when Redis is down. Cap ~3508×2480, fetch once, `await canvas.encode`, queue everything, separate `cert-worker` with its own memory limit | done (#110), deployed |
| S21 | **Unhandled rejections kill a replica.** Unhandled rejections kill a replica (Node 22): `void sendRegistrationConfirmations` right after payment, `void dispatch` in push campaigns. `.catch(log)` at every `void` call + a global `unhandledRejection` logger | done (#110), deployed |
| S22 | **Recurrence cron duplicates occurrences.** Recurrence cron runs on all 3 replicas, unlocked, read-then-create, so occurrences can duplicate. `runExclusive` + `@@unique([seriesParentId, startDateTime])` | done (#110), deployed |

**P2: hardening**

| # | Item | Status |
|---|---|---|
| S23 | **Payout separation of duty and capability checks.** Payout separation of duty: request/payout-account routes allow any Space Admin or the creator, bypassing `EVENT_MANAGE_MONEY` (`payouts.service.ts:927`). Gate on `assertCan`. Same family: certificates (`:98`) and reports (`:48`) hand-roll role checks that wrongly refuse platform admins and event curators. Move every inline `SPACE_ADMIN_ROLE_CODES` check (15 files) to `@Can` | done (#110 + this PR), deployed; remaining `SPACE_ADMIN_ROLE_CODES` uses are recipient/list queries, not gates |
| S24 | **Member search leaks user emails.** Member search returns any platform user's email by substring (`spaces.service.ts:759`): email harvesting. Exact match only | done (#110), deployed |
| S25 | **Career résumés uploaded public and unthrottled.** Career résumés uploaded public and unthrottled (`careers.service.ts:181`). `uploadPrivate` + signed URLs + throttle | done (#110), deployed |
| S26 | **Tighten CORS origin allowlist.** CORS: `startsWith('http://localhost')` and http `*.unifesto.app` allowed. Exact regex, https only | done (#110), deployed |
| S27 | **API logs leak tokens and scale poorly.** api_logs store raw paths with bearer claim tokens and spoofable IPs; one insert per request; `ILIKE` scans. Log the route template + `req.ip`, sample 2xx GETs, batch retention, better indexes | done (#110), deployed |
| S28 | **Webhook event dedup.** Webhook dedup: store Razorpay event id / Meta message id unique; captured handler skips REFUNDED/CANCELLED | done (#110), deployed |
| S29 | **Validate auth and payout request bodies.** Inline auth/payout body types skip validation (payout `amount: "abc"` → NaN passes guards). Real DTOs; `@Max(100)` on list `limit`s (`GET /events`, users) | done (#110), deployed |
| S30 | **Stays mark-paid gated by wrong permission.** Stays `mark-paid` gated by check-in permission. Use attendee-manage or money capability | done (#110), deployed |
| S31 | **Dedicated secrets and boot-time env validation.** Secrets: `JWT_SECRET` reused for email-tracking + traffic HMACs with hardcoded fallbacks; not validated at boot. Dedicated secrets; Joi/zod env schema in `ConfigModule` (JWT_SECRET, PORT, DIRECT_URL…) | done (#110), deployed; secrets validated by the existing ConfigValidationService, not a new schema lib |
| S32 | **Timeouts on every outbound client.** Timeouts on every outbound client: WhatsApp (8 axios calls), Razorpay, S3/SES/Resend, LiveKit | done (#110), deployed |
| S33 | **Chunk reminder, campaign and export fan-out.** Fan-out: event/session reminders fire every attendee at once and ignore soft-deleted events; email campaigns run in-process and stick in SENDING after a deploy; reports + exports build in memory on the request. Chunk with a limit, BullMQ campaign jobs with checkpoints + stale sweep, stream CSV | done (#110), deployed |
| S34 | **DB N+1s, table retention and cron locks.** DB: N+1s on the check-in gate path (offline sync, bulk), payouts, leaderboard upserts, `canManage`; retention for `page_views`, `push_logs`, `user_notifications`, `email_campaign_logs`, `short_link_clicks`, `whatsapp_messages`; `runExclusive` on unlocked cleanup crons | done (#110), deployed |
| S35 | **Observability: structured logs, Sentry, health cache.** Observability: nestjs-pino with request id from `cf-ray`, Sentry for 5xx + cron failures, drop Prisma `query` log in prod, cache `/health` 5–10s (it hits S3 every probe), delete `getPm2Logs` `execSync` | done (#110), deployed |
| S36 | **Socket gateway auth and reconnect-storm cache.** Socket gateway: auth in `io.use`, disconnect on token expiry, 2s Redis cache for `getPublicSnapshot` (reconnect storms) | done (#110), deployed |
| S37 | **CI lint blocks destructive migrations.** CI lint: fail migrations containing `DROP COLUMN`/`DROP TABLE` unless marked as a contract step | done (#110), deployed |

**P3: cleanup and tests**

| # | Item | Status |
|---|---|---|
| S38 | **Delete dead backend modules.** Delete dead modules: `aws` (22 routes, includes the `$queryRawUnsafe` table-name injection), `roles`, `discussions` (plus mobile's orphan API fns calling a non-existent replies route; also has a pin/lock bypass via `PATCH`), `firebase` + `AdminDevice` + admin device-token routes | done (#110), deployed |
| S39 | **Delete dead legacy leaderboard routes.** Delete ~25 dead legacy leaderboard routes (`leaderboard.controller.ts`); trim `leaderboard.service.ts` method by method (hackathon shares it) | done (#110), deployed |
| S40 | **Remove duplicate CategoriesModule import.** Remove the duplicate `CategoriesModule` pasted inside `ThrottlerModule.forRootAsync` imports (`app.module.ts:72`) | done (#110), deployed |
| S41 | **Remove unused backend dependencies.** Unused deps: `googleapis`, `firebase-admin`, `bcrypt`, `docx`, passport ×4, `ws`, `@types/socket.io`, 7 AWS SDK clients (after S38); fix `ts-jest`/`jest` and `pdfkit` types mismatches | done (#110), deployed |
| S42 | **Drop dormant schema via contract migrations.** Dormant schema: `Referral`, `referralCode`, `referralUpdates`, coins/cashback columns, `SKIPPED_MUTE`; finish GroupSeat consolidation (drop `groupMembers` fallbacks); stop writing the "do not read" WhatsApp URL fields. Contract migrations, one at a time | done and deployed: referrals, coins/cashback, `SKIPPED_MUTE`, legacy event WhatsApp URLs dropped (#158); `groupMembers` readers removed (#159); seats now created at checkout and `group_members` dropped (#162, two-step deploy 2026-10-16) |
| S43 | **Deduplicate shared helpers and controllers.** Duplication: one event-access helper (8 variants today), one `isAdmin`, shared CSV util, shared admin/space email controller, `slugify` dep instead of local copy | done (#110), deployed |
| S44 | **Clean up stale code comments.** Stale comments: wallet/coins wording, ORGANISER role comments, done `TODO(you)` markers. Real open decision: sponsor override inheritance (`sponsors.util.ts:32`) | done (#110), deployed |
| S45 | **Tests on the money paths.** Tests on the money paths, written alongside S9–S16: register → pay → cancel → refund → payout, verify/webhook race, coupon cap, capacity race. Today payouts, main refunds, core registrations, stays bookings, coupons service, events, spaces have no spec; no e2e | done (#159): `money-paths.spec.ts` covers verify/webhook race, waitlist convert, transfer race, coupon cap, pay→cancel; each guard reverted once to confirm its test fails |
| S46 | **Split the registrations service.** Split `registrations.service.ts` (5,934 lines) into checkout, verify/webhook, cancel/restore, export services as S9–S16 touch them | done (#159): split into 10 services behind a 215-line facade; routes and log context unchanged |
| S47 | **Migration timestamp hygiene.** Migration hygiene: two migrations share `20260930120000`; two were committed out of timestamp order. Note it; never reuse a timestamp | done (#110), deployed |


**P1: follow-ups found while building S (2026-10-14)**

| # | Item | Status |
|---|---|---|
| S48 | **Mobile verify can delete a real user account.** `verifyMobile` deletes the "placeholder" user when the mobile already belongs to someone, swallowing errors; that user can be a real email-OTP account, so its identities and data cascade-delete. Merge or refuse instead | done (#156), deployed: only an empty Cognito placeholder is deleted, in one transaction; anything else gets 409 (no merge flow) |
| S49 | **OTP lockout abuse; add per-IP limits.** OTP lockout abuse: 6 wrong guesses lock a victim out for 15 min, and the 10/day send cap can lock them out for 24 h. Add a per-IP send/verify limit | done (#156), deployed: per-IP buckets checked first (50 wrong guesses/15 min, 100 sends/h); identifier-wide guess cap 5 → 15 |
| S50 | **Take session capacity atomically.** Session capacity is not taken atomically on register/verify (S10 covered events only) | done (#157), deployed |
| S51 | **Apply refund claim to all refund paths.** Refund paths outside `refunds.service` (sessions `:429`, stay-bookings `:719/:1026`, team-changes `:512`) don't use the S11 claim | done (#157), deployed: `refundDueAt` claim + 15-min retry crons for sessions and add-seat purchases; stays claim tightened |
| S52 | **Smaller money gaps in refunds and transfers.** Smaller money gaps: refund totals ignore automatic sold-out refunds; `eventMoneyRecords` misses `GroupSeatPurchase`; transfer requests can race; a lost waitlist-convert race sends a duplicate confirmation; sessions register can revive a REFUNDED/CANCELLED row | done (#157 refund totals, `GroupSeatPurchase` in money records, session revive; #159 transfer-request race, waitlist duplicate confirmation), deployed |
| S53 | **Clean up legacy unverified identity rows.** Data: legacy `user_identities` rows stored `emailVerified = !!email`, so they're still trusted for email linking. Decide and clean up | done (#156), deployed: decided to trust only EMAIL/GOOGLE/APPLE; migration untrusts the rest (PHONE today) |
| S54 | **Cert, fan-out and DB hardening remainders.** S20/S33/S34 remainders: cert-worker also runs every cron and serves on 8080; Resend timeout can't abort the fetch; reports render in-process; campaign recipient lists and xlsx/pdf exports build in memory; no `text_pattern_ops` index for api_logs path prefix search (S27) | done (#158), deployed; reports stay in-process (already background, pdfkit stays within heap) and campaign recipient lists stay in memory (A/B split + checkpoint need the count) |
| S55 | **Post-deploy checks after #110.** After the #110 deploy: confirm retention periods before the first sweep (04:15 IST), recount `sold_count`/`registered_count` (S9/S15 drift), watch logout reports (60 s refresh-reuse grace, `REFRESH_REUSE_GRACE_MS`), check the Cognito pool maps `email_verified` | done: retention dry-run, seat recount applied, Cognito `email_verified` mapped (2026-10-14/15); only "watch logout reports" left, which is monitoring |
| S56 | **Product decisions left in code.** Product decisions left in code: sponsor override inheritance (`sponsors.util.ts:32`), Space transactions net formula; S43 admin/space email controllers not merged | done (#158), deployed: blank or whitespace sponsor overrides inherit the roster; net formula settled in A3; admin/space email controllers left separate (different routes and guards) |

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
| O0 | **Hotfix lane on hotfix/4.1 until 2 Dec.** (only if something is badly broken for live users): branch `hotfix/4.1` from `e87540f` (the 4.1.1 OTA commit), cherry-pick the JS-only fix, run `ota:preflight` (it passes on the 4.0.5 runtimes), and publish with the `--skip-bundler` recipe. Never merge `hotfix/4.1` back into `main`; land the same fix on `main` separately | standby |
| O1 | **Batch fingerprint fixes into the next store build.** Batch in fingerprint fixes that need a store build anyway: `platforms: ["ios", "android"]` in `app.config.js` (makes `npm run update:production` work and retires `--skip-bundler`), and `sourceSkips: SourceSkips.PackageJsonScriptsAll` in `fingerprint.config.js` (editing npm scripts never changes the runtime again). Pull in any other native work wanted soon, such as C7 rich push, or consciously leave it for the next window. Land before the 20 Nov freeze | done (#109), not deployed |
| O2 | **Bump to 5.0.0 and run the production EAS build.** Version → 5.0.0; `eas build --profile production --platform all` from `main` after the 20 Nov freeze | planned |
| O3 | **Device QA of the 5.0.0 build on TestFlight.** Device QA on TestFlight / internal testing. This is the first time 76 commits run on a phone. Smoke-test login, Home, event → register free + paid, ticket + QR, group claim, check-in scanner (online + offline), Space tab manage screens, Apex tab, app icon picker, haptics, light/dark, push + deep link | planned |
| O4 | **Record runtimes from EAS build metadata.** Record runtimes **from EAS metadata** (`eas build:list --json` → `runtime.version`), not `ota:record`, which hashes the local tree. Keep the 4.0.5 entries until O6 | planned |
| O5 | **Submit 25 Nov, release 2 Dec, verify a 5.0.1 OTA.** `eas submit` on 25 Nov with manual release; release on **2 Dec**, then publish a tiny 5.0.1 OTA at 20% and confirm a real phone receives it (Profile › About shows the update id) | planned |
| O6 | **Move users off 4.0.x runtimes with update prompts.** Move people off the 4.0.x runtimes, which can never get another OTA. Show a soft update prompt as soon as 5.0.0 is live on both stores, then raise the minimum version to 5.0.0 once most active users have moved (decision for you: how long between soft and hard) | done (#109): soft prompt built, off until latest version is set in Apex › App version on 2 Dec. Gap between soft and hard is still your call |

**Phase 2: make it impossible to repeat**

| # | Item | Status |
|---|---|---|
| O7 | **CI OTA-safe check on mobile PRs.** on every PR touching `mobile/`: run preflight with `GOOGLE_MAPS_ANDROID_API_KEY` as a GitHub secret (the only env var feeding the config). If the PR's head no longer matches a live runtime while its base did, the check fails with "native change: needs a store build" | done (#109), not deployed |
| O8 | **Native PRs wait for the next store-build window.** PRs that change the runtime get a `native` label and stay open until the next store-build window, when they merge together right before the build. JS PRs never wait. Before 2 Dec, native PRs merge normally into the 5.0.0 build. All PRs still base on `main` | done (#109); `native` label created |
| O9 | **PR template shows the OTA-safe CI result.** PR template: replace the free-text "Ships as" with the CI result (OTA-safe ✓ / store build) | done (#109), not deployed |
| O10 | **Record build runtimes from EAS, retire ota:record.** `scripts/ota-record-build.js`: fetch the latest finished production build per platform from EAS and write its runtime to `runtime-fingerprints.json`. Delete `ota:record` | done (#109), not deployed |
| O11 | **One OTA rollout at a time per channel.** Make `update:production` refuse to publish while another rollout on the channel is below 100%. Promote it or revert it first, so one rollout runs at a time | done (#109), not deployed |
| O12 | **Stale-OTA alarm in Apex OTA updates.** Apex › OTA updates shows how many mobile commits on `main` are newer than the last published update, plus whether `main` is OTA-safe. That makes "nothing shipped for 10 days" visible | done (#109), not deployed |
| O13 | **Show OTA update and runtime adoption in Apex.** add `runtimeVersion` + `updateId` to the app-version report (`src/lib/appVersionReport.ts` sends only version + platform today) and a backend column, so Apex shows the share of active users on each update and runtime | done (#109), not deployed |
| O14 | **Test promote, revert and republish on preview channel.** Test promote / revert / republish on the `preview` channel once, with an internal preview build. The Apex mutations are still untested. Use the preview channel to QA risky OTAs before production | planned |
| O15 | **Publish OTAs regularly after mobile PRs merge.** Publish habit: OTA whenever a batch of mobile PRs has merged and been checked on a device. Don't let JS sit on `main` unshipped | planned |
| O16 | **Rewrite mobile OTA docs for the new flow.** Rewrite `mobile/docs/OTA.md` for the new flow (drop the `--skip-bundler` section, add the native-window rule, record-from-EAS and the one-rollout rule) | done (#109), not deployed |
| O17 | **Clear store review risks and land native fixes before the freeze.** Everything native must merge before the Fri 20 Nov freeze (R1); | next |

**Done when:** a phone on the latest store build receives every OTA published from `main`; CI has flagged at least one native PR; and Apex shows update adoption.

### 0 · Clean house (removes leftovers)

From the audit: dead and pre-pivot code across all three apps. Zero behaviour change apart from removing unreachable routes.

| # | Item | Status |
|---|---|---|
| 0.1 | **Apex: delete orphan pre-pivot pages.** Apex: delete orphan pre-pivot pages `billing/`, `settlements/`, `spaces/request/`, `events/new/` (broken for admins: needs `currentSpace`) | done (#108) |
| 0.2 | **Apex: strip leftover organiser branches.** Apex: strip organiser branches from `spaces/page.tsx` (`loadMine`), `spaces/[id]` (`OrganiserHierarchyPanel`, parent-organiser mode), `payouts` (`getMyPayouts`), `refunds` (curator queue), `support` (`NewTicketForm`, own-ticket close); then `currentSpace` in `SessionContext`, the `space_admin` path, redundant "Admins only" guards (plans, status, subscriptions, logs) | done (#108) |
| 0.3 | **Apex: delete dead components and API modules.** Apex: delete dead components `CertificateDesigner`, `ticket-editor`, `EventContentSections`, `SectionEditor`; dead API modules `certificates-api`, `leaderboard-api`, `reports-api`, `sessions-api`, `waitlist-api`, unused parts of `events-api`/`registrations-api`; `lib/hack.ts`; `hasLeaderboard` in plans; unused nav icons | done (#108) |
| 0.4 | **Space: delete redirect-only routes and unused API code.** Space: delete redirect-only routes `payouts/`, `refunds/`, `bank-account/`, and the copied admin functions never called in `payouts-api`, `refunds-api`, `requests-api`, `spaces-api`, `white-label-api`, `categories-api`, `registrations-api` | done (#108) |
| 0.5 | **Mobile: delete dead screens, components and routes.** Mobile: delete `SettingsScreen.tsx`, `App.tsx`, `index.ts`, `src/navigation/*.ts.old`, `GlassyButton`, `GradientText`, `Footer`, `PasscodeInput`, `StepIndicator`, `RegistrationTimer`, `PocketWordmark`, `useRegistrationPayment`, `utils/iconMapper.ts`, `lib/spacesPlaceholder.ts`, `lib/api/device.ts`, `eventHelpers.ts`, `deepLinking.ts`, unused `constants.ts` exports; routes `spaces-list`, `signup`, `seats/[registrationId]`; stale wallet/coins comments | done (#108) |
| 0.6 | **Backend: remove legacy non-hackathon leaderboard routes.** Backend: legacy non-hackathon routes in `leaderboard/leaderboard.controller.ts` (rounds, metrics, panelists, awards). **Careful:** the hackathon services live in the same folder; delete only the controller routes with no callers | done (#107) |
| 0.7 | **Backend: remove referral and wallet leftovers.** Backend: referral and wallet leftovers (dormant tables decided separately) | done (#107) |
| 0.8 | **Close the open TODO(you) decisions.** Close the open `TODO(you)` decisions: Space detail join CTA (`SpaceDetailScreen.tsx:416`), Space tab `summaryLine` (`SpaceScreen.tsx:249`), Apex edit-user empty fields (`AdminEditUserScreen.tsx:50`), request ordering (`apexRequests.ts:160`), `pushDeviceReport.shouldReport()`, stale TODO in `appVersionReport.ts` and space `useDrawerBehavior.tsx` | done (#108) |
| 0.9 | **Drop the dead discussions feature.** `Discussion` / `DiscussionReply` have no module or UI; only `_count.discussions` in `spaces.service.ts` and the client types in space/apex/mobile `spaces-api`. Remove them, then a migration dropping `discussions` and `discussion_replies`. Replaces B10 | done |

### A · Money and trust

| # | Item | Status |
|---|---|---|
| A1 | **Space plan upgrade checkout via Razorpay.** : wire Razorpay checkout + `verifySpaceUpgrade` (`websites/space/.../billing/page.tsx:117-161` stops at "not wired up yet"). Built as part of T8 | done |
| A2 | **Apex: confirm dialogs on irreversible actions.** Apex confirm dialogs on irreversible actions: orphaned-payment `attach()`, request approve/reject, IAM grant toggle, subscription override, WhatsApp send-to-all, event publish/hide | done |
| A3 | **Settle open money TODOs in Space and Apex.** Settle money TODOs: Space transactions net formula (`transactions/page.tsx:136`), Apex financials default sort (`financials/page.tsx:79`) | done |
| A4 | **End-to-end money-path review.** Money-path review end to end: payments, refunds, payouts, reconciliation; webhook idempotency (from W1) | done: review 2026-10-18, findings A13–A23 |
| A5 | **Platform ledger with monthly close report.** Platform ledger: every fee, refund, payout and gateway charge as ledger entries; monthly close report (from W9) | planned |
| A6 | **GST invoices for platform fees and monthly export.** GST tax invoices for platform fees, GSTR-ready monthly export; TDS/TCS check with CA (from W9) | planned |
| A7 | **Revenue analytics in Apex.** Revenue analytics in Apex: GMV, net revenue, take rate per space/month, cohorts (from W9) | planned |
| A8 | Zoho Books monthly revenue sync + runway/burn summary (D4) | parked (2026-10-18): needs the A5 ledger and T11 margins first; |
| A9 | **Charge the plan platform fee to organisers (2.5 / 1.5 / 1%).** Rates in `plan_configs.platformFeePercent` (renamed from `processingFeePercent`), read by the resolver and `platform_fee_percent_for_event`; GROWTH hidden, pays Starter's rate; `/pricing` reads `/subscription/plans`. Migration ships the rates at 0 and an admin sets them in Apex once A10's notice is out, so deploying is not going live (D10) | done (#199), not deployed: ships at 0%; go live = A10 notice, then set rates in Apex Plans |
| A10 | **Notify existing organisers before the platform fee starts.** | planned |
| A11 | **Site states both fees everywhere (extend PR #180).** | planned |
| A12 | **Pricing decisions from the India price-sensitivity analysis.** | done: decided 2026-10-18 (D11); builds are A33, A34; GST waits for registration (A6) |
| A13 | **P0 live: webhook settles any registration from buyer-set notes, no amount check.** `resolveRegistrationIdForOrder` reads `paymentData.notes.registrationId` (set by the browser in Checkout) before the server-fetched order notes (`registration-payments.service.ts:511`); nothing compares captured `amount`/`currency` to the row. Pay ₹1 on any unmatched order (e.g. a session) with notes → a ₹5000 ticket goes PAID. Same in stays (`stay-bookings.service.ts:651`) and seat add-ons (`team-changes.service.ts:457`). Fix: only `fetchOrderNotes(orderId)`; require `amount === razorpayAmount*100` and INR before any claim | done (#183), not deployed |
| A14 | **Refund idempotency after a lost Razorpay response.** Any error from `payments.refund` (incl. timeout after Razorpay accepted) is treated as "nothing moved" and the claim released (`refunds.service.ts:546-558`, `:471-480`) → re-approve refunds twice. Auto-refund crons (registrations, sessions, seats, stays) retry forever on the same case. Stuck PROCESSING has no exit and blocks new requests. ₹0 refunds get marked APPROVED (`:566-580`). Fix: `X-Refund-Idempotency` keyed by request id; on non-4xx keep PROCESSING and check Razorpay refunds by `notes.refundRequestId`; admin "resolve stuck refund"; throw on `refundedNow === 0` | done (#184), not deployed |
| A15 | **Handle `refund.processed` / `refund.failed` webhooks.** None handled: a refund that fails later stays REFUNDED/APPROVED with seats released, attendee never paid | done (#184), not deployed |
| A16 | **Paid sessions: lockout and webhook confirm.** Pending paid row defaults to `status=REGISTERED`, so after closing the payment sheet every retry says "Already registered" (`sessions.service.ts:762`). Webhook only logs session captures (`registration-payments.service.ts:603`): app killed before verify = captured, no seat, no refund. Fix: reuse/reissue order for PENDING/FAILED rows; webhook runs the same claim as `verifyPayment` | done (#185), not deployed |
| A17 | **Session revenue in payouts and financials.** `Payout.eventId` is required and payouts/financials/timeseries never read `sessionRegistration`: session money can't be paid out or seen. Fix: session payout source (nullable eventId + sessionId) folded into the aggregates, or block paid sessions until then | planned |
| A18 | **Plan upgrade: server-side activation.** Only client verify activates (`subscription.service.ts:198`); a captured `sub_` payment via webhook is logged as unrecorded. Fix: webhook branch on `notes.spaceId`+`plan` calling the idempotent activation (unique `subscription_history.payment_id`); add plan payments as a reconciliation source (now false MISSING_IN_PLATFORM). Overlaps T8 | dropped (2026-10-18): merged into T8 (doc R8 already includes order.paid webhook activation; |
| A19 | **Stop checkout cleanup from deleting link, paid and waitlist rows.** Manual add with "collect payment" leaves `orderId` null and never stores the link; in-app checkout then deletes the row (`registration-checkout.service.ts:806`, `:288`) and a later link payment is orphaned or double-charged. Fix: store link id, cancel not delete, cancel the Razorpay link when the row is cancelled/superseded | done (#190), deployed |
| A20 | **Overdrawn event doesn't block payouts on the space's other events.** `computeBalance` / `createPayout` ceiling are per event (`payouts.service.ts:262`, `:966`); a refund after payout leaves event A overdrawn while event B pays out in full. Space Financials already nets it, payouts don't. Fix: subtract other events' overdrawn total under the lock. Also check bank account belongs to the event in admin `createPayout` (`:947`) | planned |
| A21 | **Freeze the platform fee per sale.** Every balance and financials path applies today's `resolvePlatformFeePercent` to all past revenue: a plan or default-rate change rewrites history and unlocks withdrawable money. Store the fee % (or paise) on each paid row at capture. Prerequisite for A9's go-live cutoff | done (#193), deployed; trigger freezes the rate, A9 must replace `platform_fee_percent_for_event` |
| A22 | **Duplicate captures on an already-paid row are kept silently.** Two tabs paying the same waitlist offer or stay booking: second capture logged "already paid" (`registration-payments.service.ts:620`, `stay-bookings.service.ts:684`), no refund. Fix: different `paymentId` on a PAID row → error log + full auto-refund | planned |
| A23 | **Reconciliation and reporting accuracy.** `truncated` ignored past 2,500 payments and not returned for refunds/settlements; `safe()` turns a failed fetch into `[]` (balance overstated, `approximate` false); date windows are UTC not IST (`reconciliation.service.ts:54`); platform refunds matched only by `razorpayRefundId` (auto refunds show as Razorpay-only); financial timeseries counts event registrations only (`admin.service.ts:496`); platform fee rounded per space vs per event/row (paise drift) | planned |
| A24 | **Refund cancelled events and hold their payouts.** Stopgap ahead of D6 (Assist wraps it later). | done (#192), deployed; base only, fee kept. Left: run the cancelled-events SQL from #192 and Refund all paid for each hit |
| A25 | **Close the gaps left in A13, A14 and A15.** Follow-ups to the DONE fixes in #183 and #184. | done (#191), deployed |
| A26 | **Add confirm dialogs to the remaining irreversible actions.** A2 (DONE) missed these; each still fires on one tap. | planned |
| A27 | **Close free-seat loopholes on paid tickets.** Paid seats can be given away with no fee. | in review (#207): free-add approvals are revocable seat quotas; old approvals stay unlimited until revoked |
| A28 | **Fix group seat edits, transfers and member data.** Money (high, confirmed). | planned |
| A29 | **Stop series edits and deletes from cascading money rows.** S14 (DONE) guarded event delete, but other paths still lose paid data. | planned |
| A30 | **Re-home payouts and roles on event ownership transfer.** acceptOwnershipTransfer moves only spaceId (backend/src/events/events.service.ts:1114-1131); | planned |
| A31 | **Make checkout trust the server total and stock.** - Mobile skips payment and shows 'You're going' from its own computed total even when the server created a paid order (mobile/src/hooks/useEventRegistration.ts:572-574). | done (#210), not deployed |
| A32 | **Add UTR, payer record and notices to manual payouts.** Manual payouts (RazorpayX was removed) lack basics. | planned |
| A33 | **Organisers can absorb the buyer fee, per event.** "Include the fee in my ticket price": the buyer pays the listed price and the fee comes out of the organiser's share (₹500 → base ₹476.19). Refunds stay base-only. After A31; mobile parts before the 20 Nov freeze (D11) | in review (#215); mobile part must merge before the 20 Nov freeze |
| A34 | **Cap the buyer fee at ₹99 per ticket.** min(5%, ₹99) per ticket in `computeProcessingFee`, served to web and mobile; applies above a ₹1,980 ticket (D11) | done (#202), not deployed |
| A35 | **Keep the mobile a curator types for imported and manually added attendees.** New accounts get a placeholder mobile and the typed one is dropped, so lists, exports and WhatsApp use a fake number. Store it on the registration and prefer it where the account mobile is a placeholder; never make it the account mobile. Split from A27 | planned |

### B · Operator productivity

| # | Item | Status |
|---|---|---|
| B1 | **Announce-to-attendees button on Space event page.** button on Space event page (backend `POST /events/:eventId/announcements` exists, no UI) | done (#153), live |
| B2 | **Bulk check-in in Space.** Bulk check-in in Space (`POST /checkin/event/:id/bulk` + client `registrations-api.ts:850` exist) | done (#154), live |
| B3 | Session edit after create in Space (`updateSession` exists) | done (#155), live |
| B4 | **Team-change window toggle in event settings.** Team-change window toggle (`PATCH /events/:eventId/attendee-controls`) in event settings | done (#201), not deployed |
| B5 | **CSV exports for Space and Apex lists.** CSV export. Space: members, rsvps, waitlist, coupon redemptions, check-in log. Apex: transactions, payouts, financials, users | done (#204), not deployed |
| B6 | **Search and pagination for Space and Apex lists.** Search + pagination. Space: rsvps, coupons, sponsors roster, leads, email, sessions, waitlist, hackathon teams, payouts. Apex: orphaned payments (content reports, request queues and support moved to D8) | done (#206), not deployed |
| B7 | **Apex: one tabbed request inbox.** Apex: one tabbed request inbox replacing 7 queues | dropped: merged into D8 |
| B8 | **Apex web: add admin tools that are mobile-only today.** Apex web: OTA, default images, stats recipients, system health, seat-count reconcile (mobile-only or backend-only today) | done (#213), not deployed |
| B9 | Subspace link requests from Space (`createSubSpaceRequest` unused) | dropped: merged into D5 |
| B10 | Discussion moderation (pin, lock, delete) in Space + Apex | dropped: discussions are dead code, removed in 0.9 |
| B11 | Support stats header (`GET /support/tickets/stats`) | dropped: merged into D8 |
| B12 | **Polish Space web from the visual audit.** From the 18 Oct visual audit of Space and Apex. | planned |
| B13 | **Add a simple editor for email campaigns.** Email compose is a raw 'Body (HTML)' textarea with merge tags (websites/space/app/(dashboard)/dashboard/email/new/page.tsx). | planned |
| B14 | **Label people vs bookings and revenue totals the same everywhere.** From the visual audit. | planned |
| B15 | **Add mobile-only desk actions to Space web.** D3 says desk work lives on web, but these curator desk tasks exist only on mobile. | done (#221), not deployed |
| B16 | **Fix operator form saves and navigation traps.** Blank fields: edit forms can't clear optional fields because blanks are sent as undefined. | done (#209), not deployed |
| B17 | **Validate event dates and copy setup into recurring occurrences.** - No date or timezone validation on event create and update (backend/src/events/events.service.ts:1424). | done (#218), not deployed |
| B18 | **Make Huddle sessions findable, listed and joinable.** Huddle sessions dead-end. Quick ones first (high, confirmed). | planned |
| B19 | **Fix certificate and report correctness at scale.** Certificates. | done (#222), not deployed |

### C · Notifications

| # | Item | Status |
|---|---|---|
| C1 | **In-app notification inbox.** (bell on Home), read/unread, backed by a delivery log | done |
| C2 | **Single notify orchestrator with channel fallback.** One `notify(user, event, data)` orchestrator: channel by preference + category, fallback push → WhatsApp → email by criticality (from W4) | planned |
| C3 | **Per-message delivery log with retries and dedup.** Delivery log per message (queued/sent/delivered/opened/failed, provider id), retries, dedup keys | planned |
| C4 | **Notification preferences grid and quiet hours.** Preferences: category × channel grid, quiet hours (IST), transactional vs marketing split | planned |
| C5 | **Provider delivery webhooks and email suppression.** Provider webhooks: SES bounces/complaints → suppress, WhatsApp status, OneSignal delivery | planned |
| C6 | Apex per-user message history + failure dashboard | planned |
| C7 | **Native: rich push images and action buttons.** Native (store build): iOS Notification Service Extension for images, push action buttons | parked (2026-10-18): native (Notification Service Extension) with no room before the 20 Nov freeze, and the next store window after 5.0.0 isn't planned. |
| C8 | **Add unsubscribe and consent to marketing sends.** Must land before the P track's curator emails and the P9 launch sends on 2 Dec. | planned |
| C9 | **Send event mail and confirmations to the right people.** Quick one first (high, live): paid-registration WhatsApp confirmations format times with toLocaleTimeString('en-US') and no timeZone, then append 'IST' (backend/src/registrations/registration-payments.service.ts:364-386, :1366-139 | planned |
| C10 | **Add filters and mark-all-read to the notification inbox.** Follow-up to C1 (merged #177), found on a real iPhone. | planned |
| C11 | **Check all-user push broadcasts reach people.** Apex Notifications shows both 'All users' app-update broadcasts (27 Sept) as '0 sent'. | planned |

### D · Unifesto Assist (support system)

One support system for everything a person needs help with. Every item is an **Assist case**: a thread, a desk and a status that points at its typed record. Refunds, requests and reports keep their own tables and money/approval logic; the case wraps them. Replaces old D1–D8 (Support complete, from 4.2.0) and the Apex request queues.

**How it works**

- **Case** = `support_tickets` extended: `kind` (HELP · REFUND · CANCELLATION · REQUEST · REPORT · PRIVACY · GRIEVANCE), `desk` (SPACE · PLATFORM), `subjectType` + `subjectId` (RefundRequest, SpaceRequest, EventRequest…), event/registration context, read state per side, SLA fields. Messages get a `side`: REQUESTER · DESK · ASSISTANT · SYSTEM, plus internal notes.
- **Routing (decision D2):** event questions, refunds' curator stage, cancellations and space-to-space requests go to the **Space desk**; account, payment, app, platform requests, reports, privacy and grievance go to the **Platform desk**. Platform sees everything. Escalation moves a case to Platform and the space keeps read access.
- **Inboxes:** Apex Assist (all queues in one), Space Assist, mobile "My Help" for requesters. Each kind gets an action panel that calls the existing endpoint (approve refund, accept request…), which then posts a SYSTEM message.
- **AI (decision D7):** Claude Haiku 5.5 (`claude-haiku-5-5`, $0.10 / $0.50 per MTok input/output, cache reads $0.01, Batch −50%). Triage, self-serve bot with read-only tools + action cards, desk drafts and summaries, request pre-screen, nightly insights. Estimated cost: ~$0.0045 per human-handled case, ~$0.0019 per bot-resolved chat; **≈ $6/mo** at 500 cases + 1.5k bot chats, ≈ $55 at 10×, ≈ $525 at 100×. Every call logged in `AiRun`; kill switch per feature.
- **Linked, not merged:** WhatsApp inbox (D26), hackathon help desk (D27), orphaned payments, C1/C2 notifications, F6 user detail, K7/I1 legal. **Kept out:** careers, leads, incidents (bot reads them), campaigns.
- **Decided 2026-10-16:** an event request means hosting an event without a Space (task D7). `event:manage-support` is on by default for Space Admin, Curator and Co-Curator and off for Crew (a space can turn it on). No auto-escalation: only the organiser or the requester escalates, and Unifesto still sees every case.
- **Decided 2026-10-16 (#147 review):** the support capability is `event:manage-support` (checked per event); a space-level case with no event goes to that space's desk (Space Admins), except an operator's own "contact Unifesto" case, which stays with Platform; the space desk sees the requester's email but not their phone; existing tickets all stay with Platform.

| # | Item | Status |
|---|---|---|
| | **Phase 1 · Foundation** | |
| D1 | **Assist Case model.** Extend `support_tickets` (kind, desk, subject link, event/registration context, escalation, first response, read state per side, rating, AI fields, BOT status); `support_messages` `isStaffReply` → `side` + `internal` + `aiDrafted`. Migration + backfill | done (#147), not deployed |
| D2 | **Access + routing + escalation.** One `canSeeCase`; new `event:manage-support` capability; routing rules; escalate to Platform (decision D2) | done (#147), not deployed |
| D3 | **Notifications both directions + unread badges.** case created / replied / status / escalated → push + email to the other side; badges in mobile, Space, Apex (old D1 + D4) | done (#203), not deployed. Apex sidebar badge waits for D8, Space desk badge for D9 |
| D4 | Attachments: private `SupportAttachment` via `StorageService`, signed URLs (old D2) | done (#147), not deployed |
| | **Phase 2 · One system** | |
| D5 | **Request adapter.** All 10 request types open and update cases (SpaceRequest, SpaceStatus, SpaceOwnership, SubSpace incl. B9, WhiteLabel until H15, FreeAttendeeAdd, RegistrationTransfer → Platform; EventOwnershipTransfer, SubEventAttach → the other space) | planned |
| D6 | **Refunds + cancellations inside Assist.** Curator stage = Space desk, admin stage = Platform desk; paid cancel = one flow that creates the refund; cancellation reason; S14 `cancelEvent` refunds run through it. After S51/S52 | planned |
| D7 | **New: Event request.** Host an event without a Space: Platform approves, which creates a personal Space, curator role and a draft event | planned |
| D8 | **Apex Assist inbox.** One inbox for every queue with typed action panels, stats header, search + pagination. Replaces Support, Requests, Refunds, report-issues and bank-account pages (B7, B11, part of B6) | in review (#212): Support redirects; Requests, Refunds, reports and bank-account pages stay until D5, D6, D21 and D22 open cases for them |
| D9 | **Space Assist inbox (web)** with internal notes and escalation (old D5) | done (#216, event-only access #220), not deployed: Space `/dashboard/assist` + desk unread badge, also for event-only operators |
| D10 | **Mobile: My Help + inboxes + Get help.** Requester timeline of every case; Space and Apex inboxes; "Get help" from event and ticket, pre-filled (old D3) | planned |
| D11 | `unifesto.app/help` opens a case; guests find-or-create by email (old D8) | planned |
| | **Phase 3 · AI layer (Claude Haiku 5.5)** | |
| D12 | **AI foundation.** `@anthropic-ai/sdk` `AiService`, `AiRun` cost log, kill switches, per-user caps, prompt caching, prompts under 100K, refusal → human, eval set, Console spend limit. Shared with Track M | in review (#205): eval set ships with each feature (D13 first); Console spend limit + `ANTHROPIC_API_KEY` at deploy |
| D13 | AI triage on every new case: category, priority, routing hint, language, sentiment, spam | merged (#208), prompt tune in review (#211), not deployed: eval 21 cases: every field 20/21+ after one prompt tune (126 checks, 1 miss, a label since fixed), $0.002 a run; on with `triage` in `ai_enabled_features` |
| D14 | **Assist bot.** Self-serve answers from help articles, event FAQs and read-only account tools; proposes action cards the user confirms; hands off to a human with the chat as the thread | planned |
| D15 | Desk copilot: draft reply, thread summary, policy facts computed by code | planned |
| D16 | AI pre-screen of space and event requests for reviewers | parked (2026-10-18): space and event request volume is small and reviewed by hand quickly; |
| D17 | Help articles in Apex as the bot's knowledge base (from K7) | in review (#214): `HelpArticle` + `/help` API, Apex `/dashboard/help`, web `/help`; event FAQs already in `EventFaq` |
| D18 | Nightly insights over closed cases (Batch API): themes and missing articles | parked (2026-10-18): nightly insights need case volume that only exists after D8, D9 and launch. |
| | **Phase 4 · Operations** | |
| D19 | Canned replies, SLA by priority, first-response and resolution metrics (old D6) | planned |
| D20 | Auto-close resolved after 7 days + satisfaction rating (old D7) | planned |
| | **Phase 5 · More case kinds** | |
| D21 | **Ticket issue reports become HELP cases.** `ContentReport` REGISTRATION ("Report an issue" on a ticket) goes to the event's Space desk; moderation keeps event/space reports | planned |
| D22 | Payout requests + bank account verification as Platform cases (with S23) | planned |
| D23 | Stay + session cancellations and refunds through D6 (with S51) | planned |
| D24 | Account deletion as a PRIVACY case with a timeline and cancel (I3) | planned |
| D25 | **Grievance cases.** IT Rules 2021: acknowledge in 24 h, resolve in 15 days, public grievance page (I1) | planned |
| D26 | WhatsApp inbox → "Convert to case", later a full channel | planned |
| D27 | Hackathon help desk: "Escalate to organiser" opens a Space case | planned |
| D28 | Space verification request (optional) | parked (2026-10-18): marked optional; verification is admin-set (Space.verifiedAt, live since #91) without a request flow. |
| D29 | **Clear the support and WhatsApp backlog.** Ops task, not code. Apex Support has 217 Open tickets ('Needs a reply'), 0 awaiting, 0 resolved, and the oldest refund requests are 12+ days old with 1 message. | next |


### E · Sponsors, partners, hackathon (from 4.3.0)

| # | Item | Status |
|---|---|---|
| E1 | **Shared collaborator invite flow.** Shared collaborator invite: email → find-or-create → invite → claim on first login | planned |
| E2 | **Space web partner portal.** Space web `/partner` portal modelled on `/sponsor`; landing routes sponsor/partner-only users to their portal | parked (2026-10-18): partners were folded into Tracking (X7); |
| E3 | Sponsor portal: lead notes + status, per-event booth stats | planned |
| E4 | Partner: multiple links, share kit (tracked link + QR) | parked (2026-10-18): no demand evidence for a partner share kit; |
| E5 | **Finish hackathon submissions: curator overview, lock after judging.** Hackathon submissions (title, repo, demo, deck) with per-round deadline; judges see them while scoring | planned |
| E6 | Hackathon certificates from awards | done |
| E7 | **Add an offline queue to BoothScan.** Offline queue for BoothScan + StayScan, reusing `src/lib/offline/checkinQueue.ts` | planned |
| E8 | **Fix hackathon judging integrity and score privacy.** Privacy first (small, confirmed): the retired public-leaderboard 'subscribe' socket leaks every team's live score and rank to any registered attendee (backend/src/leaderboard/leaderboard.gateway.ts:131, an S36 regression). | planned |
| E9 | **Add consent and anti-abuse to lead capture and fix notify-me.** - Public lead capture is unauthenticated and unthrottled, accepts private or suspended spaces and draft events, and lets anyone overwrite an existing lead by email (backend/src/sponsors/leads.service.ts:30, :76, public-leads.contr | planned |

### F · Feedback and user IAM (from 4.4.0)

| # | Item | Status |
|---|---|---|
| F1 | **Per-event attendee feedback form.** Event feedback: per-event form (rating 1–5, NPS, organiser questions using registration question types), one response per attendee | planned |
| F2 | **Feedback request timing and reminders.** Trigger to checked-in attendees 2 h after end, reminder at 48 h, closes at 7 days; optional "feedback unlocks certificate" | planned |
| F3 | **Feedback results and public rating.** Results in Space web + mobile (averages, NPS, distribution, comments, CSV); opt-in public rating at N ≥ 5 | planned |
| F4 | **User IAM: suspend, ban and force logout.** User IAM: suspend/ban with reason + expiry, force logout (revoke refresh tokens), per-user capability overrides | planned |
| F5 | **Audit trail for admin changes in Apex.** Audit trail for permission, role, status, plan and reconcile changes, shown on Apex entity detail | planned |
| F6 | Apex user detail: their registrations and payments | planned |
| F7 | **Write the 5.0.0 What's new and show it as a sheet.** In-app "What's new" sheet after an OTA applies | planned |
| F8 | **Make co-hosting a request the other space accepts.** addCoHost (backend/src/events/events.service.ts:910-935) attaches any space as co-host immediately, with no consent. | planned |

### G · Mobile scope, design and performance

| # | Item | Status |
|---|---|---|
| G1 | **Open-on-web handoffs for desk work on mobile.** "Open on web" handoffs (deep link) for desk work on mobile: event/ticket/coupon/question editors, series dates, sub-events, co-hosting, content editors, stay editors, CSV import, hackathon setup (settings, themes, statements, rounds, criteria, panels, judges, awards, certificates), white-label, billing, payout accounts; Apex blog, careers, categories, email compose/templates, plans, subscriptions, IAM, reconciliation, logs, default images | planned |
| G2 | **Make on-site mobile tools survive offline and slow networks.** Keep on mobile and polish: check-in (online + offline), scanners, attendee actions, waitlist offers, hackathon queues/rooms/announce/help-desk, judging, leads, refund approve, support, WhatsApp inbox, request review, status, OTA | planned |
| G3 | **Cosmos migration of the remaining mobile screens.** Cosmos migration in order: manage-event subtree → check-in → attendee leftovers (registration success, claim, group, refund, sessions, live session, stays, edit details) → hackathon/judging → Apex. About 115 screens | planned |
| G4 | **Move long mobile lists to FlatList.** Long lists → `FlatList`: Waitlist, ManualCheckin results, HackathonTeams, Queues, Results, Leads, Coupons, `sessions.tsx`, `group/[registrationId]` | planned |
| G5 | **Space web: PageHeader and EmptyState rollout.** Space web page pattern: Stays pages on `PageHeader`/`EmptyState`; `EmptyState` on attendees, checkin, transactions, tracking, IAM, settings | planned |
| G6 | **Remaining on-site web-to-mobile parity.** Remaining web → mobile parity, on-site parts only: certificates issue, reports view, sessions list | dropped (2026-10-18): merged into G8 (both cover on-site web-to-mobile parity, x-parity-16); |
| G7 | Unicon: redraw glyphs in our own style, tab bar + Home first | parked (2026-10-18): redrawing Unicon glyphs in a house style is design polish with no user value before 5.0.0; |
| G8 | **Organiser event-day mode on mobile.** Organiser "event day" mode on mobile: one cockpit with live check-in count, today's revenue, announce, help-desk queue | planned |
| G9 | **Unify the mobile API client: refresh, errors and deep links.** - A silent refresh that fails with 5xx or 429 signs the user out (mobile/src/lib/api/helpers.ts:129, :190); | planned |
| G10 | **Fix check-in for group members, undo and offline sync.** Groups: bulk check-in (a B2 regression) and Space web scan check in whole groups at registration level (backend/src/checkin/checkin.service.ts:1036, :1180, team-changes.service.ts:263), and a member's pass shows 'You are checked i | planned |
| G11 | **Add ended-event states to tickets, hubs and Space.** Visual audit. | planned |
| G12 | **Fix mobile attendee and organiser screens.** Quick ones first. | planned |
| G13 | **Polish mobile from the 18 Oct device audit.** Low and medium items from the real-iPhone pass. | planned |
| G14 | **Fix accessibility: labels, Dynamic Type and contrast.** Mobile: 179 FieldRow inputs and AuthField have no accessible label (mobile/src/components/manage/FormFields.tsx:48); | planned |

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
| H1 | **P1 white-label theme migration.** P1 migration `20261014120000_white_label_theme`: `brandFont`, `brandMode`, `hidePoweredBy`, `brandingSuspendedAt` (`brandLogoUrl` revived) | done, not deployed |
| H2 | **P1 branding resolvers and self-serve white-label API.** P1 `branding.util` resolvers (on && plan && !suspended; payload adds name/logo/font/mode/hidePoweredBy, 5-test spec); `/white-label` routes self-serve via `@Can`; logo/favicon upload; admin suspend; private brand fields stripped from public space payloads | done, not deployed |
| H3 | **P1 web: branded chrome on space and event pages.** P1 web: `components/BrandedChrome.tsx` replaces Navbar/Footer on space + event pages when the space theme is live; Google font + forced light/dark | done, not visually verified |
| H4 | **P1 Space Branding studio and mobile brand logo.** P1 Space Branding studio (all fields + uploads + live preview + event colours + upsell); Apex Manage page Suspend/Restore; mobile manage card self-serve copy; mobile space + event screens show the brand logo as the header title and light the sky with the brand colour | done, mobile not visually verified |
| H5 | **P2 branded email layout for attendee emails.** P2 branded email layout (logo/name header, accent buttons, "Sent by X via Unifesto") on all 12 attendee templates; `EmailService.brandFor(eventId)` resolves theme + sender centrally | done, not deployed (#106) |
| H6 | **P2 custom sending domains per space.** P2 `SpaceDomain` (migration `20261014140000_space_domains`) + Resend Domains add/verify/remove + studio card; mail sends from `<local>@<verified domain>` | done, not deployed (#106) |
| H7 | **P3 custom web domains per space.** P3 custom web domains: Cloudflare custom hostnames add/verify/remove, public `GET /white-label/domains/resolve`, Caddy catch-all, web middleware tenant routing (+ `scripts/middleware.check.mts`), per-host canonical/OG, emails link to the custom domain | done, not deployed (#106) |
| H8 | **Needs you: Cloudflare for SaaS and Resend setup.** enable SSL for SaaS on the zone, create fallback origin `domains.unifesto.app`, API token → `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN`; check the Resend plan's domain limit | done 2026-10-15 (events.wegobeyond.in live end to end) |
| H9 | Bring-your-own WhatsApp sender per space (today it's one env number) | parked (2026-10-18): per-space Meta WhatsApp sender onboarding is heavy and the WhatsApp cost trim keeps WA minimal; |
| H10 | **Deploy #106 white-label release.** Deploy #106: read migrations `20261014120000_white_label_theme` + `20261014140000_space_domains`, `migrate deploy`, rebuild backend + web + space + apex, Caddy reload, mobile OTA (manage-card copy) | done: shipped in the 14 Oct full deploy (83d24f0), checked 16 Oct; mobile copy rides the 5.0.0 store build |
| H11 | **Verify white-label rendering after deploy.** Verify after deploy: branded space + event page (header/footer, font, forced mode), Branding studio uploads + preview, a branded registration email in Gmail + Apple Mail (light/dark), suspend/restore from Apex. None of this was seen rendered | done 16 Oct: checked on Beyond (pages, studio save + uploads, branded emails, Apex suspend/restore), all reverted; email dark mode checked in code only |
| H12 | **Mobile: use the space font on space and event screens.** Mobile: `branding.font` on space + event screens (logo shipped with H4) | done (#146), not deployed; not seen on device |
| H13 | **Use the custom domain in calendar and share links.** Web "Add to calendar" (`lib/calendar.ts`) and share links use the space's custom domain when it has one | done, live 16 Oct (#135) |
| H14 | **Send certificate emails from the space's address.** Certificate emails go via SES, so they can't use a space's custom sending address (name + reply-to only). Verify the domain in SES too, or move certificate mail to Resend | planned |
| H15 | **Retire legacy white-label requests in mobile, Apex and backend.** Retire the legacy request flow once no shipped mobile build calls it: `POST /white-label/requests`, Apex White-label History, mobile request copy, then drop `white_label_requests` | planned |
| H16 | **Space app: gate Branding on manage-settings capability.** Space app `Capability` type has no `space:manage-settings`, so the Branding nav item gates on `manage-billing` (backend enforces manage-settings). Add the capability to the space RBAC types | done, live 16 Oct (#135) |
| H17 | **Serve font presets from the overview endpoint.** Font presets are duplicated in `backend/src/white-label/branding.util.ts` and `websites/space/lib/api/white-label-api.ts`; serve them from the overview endpoint instead | done, live 16 Oct (#135) |
| H18 | **Custom-host lookup cache delays suspension by up to 60s.** Custom-host lookup is cached 60s per web process, so a suspension or removal takes up to a minute to take effect. Fine for now; shorten or invalidate if that matters | parked |
| H19 | **Canonical URLs point to the space's custom domain.** Event + space pages of a space with a live custom domain set canonical and og:url to it, also on www (no redirect, old links keep working) | done, live 16 Oct (#135) |
| H20 | **Upgrade Resend plan before selling custom sending domains.** Free allows 1 domain and `notify.unifesto.app` uses it, so the first space to verify its own sending domain is refused | planned; needs you (#146 adds the guard: clear 403 when Resend refuses on the domain limit) |
| H21 | **Apex white-label form loads the target's live branding.** It showed #3491ff for every space, so Apply could overwrite a real colour | done, live 16 Oct (#140) |
| H22 | **Square space logo is too small in the branded header and email.** Size up the square fallback or show the name beside it | done (#146), not deployed |
| H23 | **Branded emails still mention the Unifesto app.** Keep, reword or drop "Your ticket is also in the Unifesto app" when the space theme is live | planned; needs a decision |
| H24 | **Email calendar attachment links to the custom domain.** `buildIcsAttachment` runs before `brandFor()`; pass the brand's `customDomain` into `IcsEventInput` | done (#146), not deployed |
| H25 | **Fix white-label custom-domain forms, sender names and takeover.** Quick one first (high, live since #106): the CORS allowlist accepts only *.unifesto.app and localhost (backend/src/common/cors.ts:13-18, main.ts:73-89). | planned |

### I · Legal (from W6)

Drafts need a human lawyer's sign-off before publishing.

| # | Item | Status |
|---|---|---|
| I1 | **Legal documents: terms, privacy, refund and other policies.** Terms (attendees), Organiser/Space Agreement, Privacy Policy (DPDP 2023), Refund & Cancellation, Acceptable Use, Sponsor & Partner terms, Cookie Policy, Grievance page (IT Rules 2021) | planned |
| I2 | **Versioned legal docs with per-user acceptance.** Versioned legal documents with acceptance per user; re-acceptance on next launch on every client | planned |
| I3 | DPDP erasure on account close (#41): needs backend rebuild | done; follow-up I5 |
| I4 | **Privacy Policy retention line for erased answers.** Privacy Policy retention line for erased question answers, once I1 + I3 land | planned |
| I5 | **Finish DPDP erasure and set retention limits.** Quick fix first: account deletion never completes for anyone whose bank account received a payout (FK RESTRICT on bank accounts), and the failure is never reported (backend/src/users/users.service.ts:1020). | planned |

### J · Scale and reliability (from W1/W2)

This was cut down from the v4 EKS plan. Do the cheap wins first, and only move to EKS when traffic needs it.

| # | Item | Status |
|---|---|---|
| J1 | **Endpoint guard audit, input validation and rate limits.** Endpoint guard audit (all routes vs `@Can`/guards), input validation, per-route rate limits | planned |
| J2 | **Fix boot failures, stranded push campaigns and cron gaps.** Silent catches, cron jobs safe with multiple replicas (single-runner locks), graceful shutdown | planned |
| J3 | **Cap public list queries and fix hot-path N+1s.** Missing indexes, N+1s, unbounded `findMany` | planned |
| J4 | **Turn on Sentry and JSON logs, keep 180-day logs.** Structured logs + request ids + error alerting; deeper `/health` | planned |
| J5 | **Queue publish emails, bulk import and blasts.** Queue heavy work (email, push fan-out, PDF/cert rendering) off the request path | planned |
| J6 | **Drill a backup restore on a staging copy, then run k6.** k6 scripts for real peaks (event page, OTP login, checkout, check-in, leaderboard); baseline on a staging copy | planned |
| J7 | **Autoscaling on EKS with managed infra and CI/CD.** Autoscaling (EKS + ALB, Terraform + Helm, Secrets Manager, PgBouncer, Redis, CI/CD replacing `deploy.sh`) | parked: only when J6 shows the current host can't take the peak |
| J8 | **Cap group size on every registration path.** Critical. groupSize has only @IsInt @Min(1) (backend/src/registrations/dto/index.ts:100-105, :247-252). | next |
| J9 | **Keep private event and session fields out of public APIs.** - Anonymous GET /events, GET /events/space/:id and favourites return every Event column through include with no select (backend/src/events/events.service.ts:1554-1593, getSpaceEvents ~:2675), exposing whatsappAttendeeGroupUrl, onl | next |
| J10 | **Close cross-tenant writes on ticket types and space hierarchy.** 1. IDOR: deleteTicketType never checks that tt.eventId equals the authorised event (backend/src/events/events.service.ts:3056-3086; | next |
| J11 | **Fix stored XSS in email preview and SSRF in certificate render.** 1. XSS: the Space email preview iframe uses srcDoc with no sandbox (websites/space/app/(dashboard)/dashboard/email/new/page.tsx:449-453), so template HTML runs in the Space origin. | next |
| J12 | **Make Redis and config caches replica-safe.** 1. The shared RedisService retryStrategy returns null after 3 tries (backend/src/redis/redis.service.ts:41-55), so the ioredis client ends for good, and a failed boot ping sets client=null (:106-108). | next |
| J13 | **Deploy only CI-green main with a rollback image.** deploy.sh:87-110 rsyncs the local working tree with no check on git status, branch, origin/main or CI, and parallel sessions share this tree. | next |
| J14 | **Move production secrets off the dev laptop.** backend/.env and backend/.env.local are identical, set NODE_ENV=production and point at the prod RDS. | planned |
| J15 | **Move personal files and recordings to private storage.** - Event report PDFs (full roster with emails and revenue) are uploaded to the public bucket at non-expiring URLs and survive 'delete' (backend/src/reports/reports.service.ts:236), contradicting the Privacy Policy. | planned |
| J16 | **Enforce space status and event visibility everywhere.** Setting a space to SUSPENDED, ARCHIVED, REJECTED or INACTIVE only updates the status column (backend/src/admin/admin.service.ts:830-846, spaces.service.ts:513-575). | planned |
| J17 | **Harden auth and operator sessions.** Identifiers: emails are never normalised, so case variants create separate identities and bypass per-identifier OTP limits (backend/src/auth/auth.service.ts:192); | planned |
| J18 | **Make the schema rebuildable and harden the production host.** - Migration history can't rebuild the schema. | planned |
| J19 | **Add CI gates: builds, lint, dependency scan and tests.** - All three Next apps ship with typescript.ignoreBuildErrors although they now typecheck clean (websites/web/next.config.ts:31, websites/space/next.config.ts:17), and the web proxy self-check script is broken. | planned |

### K · Growth and discovery

| # | Item | Status |
|---|---|---|
| K1 | **Discovery marketplace on web and mobile.** Discovery marketplace on web + mobile: browse by city/college/category, "trending near you" | planned |
| K2 | **Fix SEO gaps: crawlable cards, event JSON-LD, full sitemap.** SEO: sitemap (events, spaces, blog, careers), JSON-LD (Event, Article, JobPosting), RSS, canonicals (from W7) | planned |
| K3 | **Harden the blog and careers editors: draft guard, scheduling, slugs.** Blog: authors, tags, scheduled publish, OG image, reading time, related posts | planned |
| K4 | **Careers: application form and applicant pipeline.** Careers: application form with private resume upload + applicant pipeline in Apex | done |
| K5 | **Tracked short links with QR and click country.** Tracked short links on the apex domain + QR; country in click tracking (from W10) | in progress |
| K6 | **Count web visits and referrers by domain.** Web referrer capture rolled up by domain; Search Console backlink import, weekly | planned |
| K7 | **Legal pages managed in Apex.** Help articles moved to D17 (Assist knowledge base) | parked (2026-10-18): legal pages change rarely and need lawyer sign-off; |
| K8 | **Show past and live events in public lists.** getEvents hard-filters status PUBLISHED (backend/src/events/events.service.ts:1481-1488), and GET /events/space/:id does the same for outsiders. | next |
| K9 | **Fix the public event page and remove fake web pages.** 1. On phones /event/[slug] renders 499px wide in a 375px viewport and is clipped (title, venue and Directions cut off) on the main conversion page. | next |
| K10 | **Let attendees register and pay on the web.** Registration is app-only: websites/web/src/app/event/[slug]/register/page.tsx redirects ('Registration is mobile-only') and the CTA is an intent:// deep link, so desktop visitors go to /download. | next |
| K11 | **Polish the public web from the visual audit.** Low items from the visual audit. | planned |

### L · Live engagement (new)

The biggest product gap versus KonfHub. It keeps attendees in the app *during* the event.

| # | Item | Status |
|---|---|---|
| L1 | **Live polls during events.** Live polls (organiser launches from mobile event-day mode, attendees vote on ticket screen) | planned |
| L2 | Q&A with upvotes + moderation, per session/track | planned |
| L3 | Quizzes with a live leaderboard (reuse hackathon leaderboard sockets) | planned |
| L4 | Projector view on web (results, Q&A wall) | planned |

### M · AI assists (new)

| # | Item | Status |
|---|---|---|
| M1 | **AI: draft event content from a few lines or a link.** Draft event description, agenda and FAQs from a few lines or an imported link | planned |
| M2 | Email/WhatsApp copy suggestions in campaigns | parked (2026-10-18): low value; revisit after D12 (AI foundation) and C8 (unsubscribe and consent) land. |
| M3 | Post-event report summary (attendance, revenue, feedback themes) | planned |
| M4 | **Who to nudge: past attendees likely to register.** "Who to nudge": past attendees likely to register, for a curator-approved campaign | parked (2026-10-18): nudging past attendees needs consent and unsubscribe (C8, I2) first, or it is a DPDP and spam risk. |

### N · On-site (new)

| # | Item | Status |
|---|---|---|
| N1 | Badge/pass printing (PDF sheets + label printers) from the roster | planned |
| N2 | Kiosk self check-in (tablet mode: scan or search your name) | parked (2026-10-18): college fests check in with volunteer scanners; |
| N3 | **Attendee networking: who's going and connect requests.** Attendee networking: opt-in "who's going" + connect requests at hackathons and fests | parked (2026-10-18): attendee networking is privacy-heavy (needs I2 consent) and has no demand evidence before launch. |

### P · Marketing to 5.0.0 (14 Oct → 2 Dec)

Seven weeks of content that ends on the 5.0.0 launch. The only track with dates, because it works back from D6.

**Rules**

- **Market only what is live in prod.** Web and Space features can be shown once deployed. Mobile changes are teasers only until 2 Dec (D6): never say "update now" before the stores show 5.0.0. White-label waits for H11. Never post about security fixes (Track S).
- **Copy voice:** organiser-first, experience-side ("no queues on event day"), short headlines, no em dashes, "My X" in UI shots. Brand names: Unifesto Huddle, Unifesto Sprint, Unifesto Stay.
- **One recording feeds everything.** Each week: record one long video, then cut it into 3 shorts, 1 LinkedIn video, 1 carousel and 1 blog. Never make a channel-only piece when a cut will do.
- **Every link is tracked** (K5 short links, or UTM `?utm_source=<channel>&utm_campaign=v5-wN` until K5 lands).
- Real events and spaces only with the organiser's OK. Banners stay 4:3, verticals 9:16.

**Weekly cadence** (Mon 19 Oct → Wed 2 Dec = 7 weeks)

| Channel | Per week | Total by 2 Dec | Source |
|---|---|---|---|
| YouTube long (6–10 min) | 1 | 7 | Recorded Mon, published Tue |
| YouTube Shorts / IG Reels (same file) | 3 | 21 | Cut from the long video + 1 POV/meme |
| Instagram posts (carousel) | 2 | 14 | 1 how-to from the video, 1 event/organiser story |
| Instagram stories | daily | ~50 | Polls, behind the scenes, reshared event posts, countdown sticker from W5 |
| LinkedIn posts | 3 | 21 | 2 founder (build in public, lessons), 1 company page (feature) |
| LinkedIn video | 1 | 7 | 60–90s horizontal cut of the long video |
| Website blog: guide | 1 | 7 | SEO guide on the week's topic, published from Apex blog admin |
| Website blog: comparison | 1 | 7 | "Unifesto vs X" on the week's topic (P11), plus 1 "X vs Unifesto" carousel from it |
| Email to curators (own email campaigns) | every 2 weeks | 4 | Roundup of the week's video + blog. Dogfoods the campaigns module |
| Outreach DMs to fest/club pages | 10 | 70 | Send the week's video, invite them to make a Space |

**Day plan** (repeat each week)

| Mon | Tue | Wed | Thu | Fri | Sat/Sun |
|---|---|---|---|---|---|
| Record long video. LinkedIn founder post. Short 1 | YouTube long. LinkedIn video | Blog. IG carousel (how-to). Short 2 | LinkedIn company post. Outreach DMs | Comparison blog + its carousel. Short 3. LinkedIn founder post | Stories only. Batch next week's edits |

**Weeks**

| Week | Theme | YouTube long | Blog (SEO target) | Comparison blog |
|---|---|---|---|---|
| W0 · 14–18 Oct | Setup (P1–P4) | none | none | none |
| W1 · 19–25 Oct | One Space for your whole team | "Set up your Space and team in 10 minutes" | "How to plan a college fest: the 8-week checklist" | Unifesto vs Google Forms + UPI + spreadsheets |
| W2 · 26 Oct–1 Nov | Tickets that sell themselves | "Tickets, group registrations and coupons" | "Group registration for fests without the spreadsheet" | Unifesto vs Townscript |
| W3 · 2–8 Nov | Beyond fests: Sprint + Huddle | "Run a hackathon with Unifesto Sprint" (only parts live in prod) | "Hackathon organiser's guide: teams, judging, help desk" | Unifesto vs Devfolio (hackathons) |
| W4 · 9–15 Nov | Money and sponsors | "Know exactly what your event earned" (financials, payouts, sponsor leads) | "How to pitch sponsors for a college fest" | Unifesto vs KonfHub |
| W5 · 16–22 Nov | Event day, no panic | "Event day: check-in, WhatsApp groups, certificates". **Teaser starts:** "Something new on 2 Dec" | "Event day runbook for organisers" | Unifesto vs Eventbrite |
| W6 · 23–29 Nov | Countdown | "Unifesto 5: first look" (screens from the TestFlight build, no "update now") | "What's coming in Unifesto 5" | Unifesto vs Luma |
| W7 · 30 Nov–2 Dec | **Launch** (P9) | "Unifesto 5 is here" | "Unifesto 5 release notes" | Best event platforms for college fests in India (2026) roundup |

**Keyword map (P15).** One search query per blog and long video, checked against Google and YouTube autocomplete (India, `hl=en-IN`) on 15 Oct. Autocomplete shows that people search the phrase, not how many do; re-check with Search Console data after W2 (P14). Rules: the query goes, word for word, in the blog title, H1 and slug, and at the front of the YouTube title (under 60 characters). Comparison slugs stay `/blog/unifesto-vs-<x>` (P11). Avoid "college event management system" (students looking for project code) and "group registration" (Kedarnath and IRCTC).

| Week | Piece | Target query | Title / H1 (YouTube title) | Slug |
|---|---|---|---|---|
| P0 | Video (live) | unifesto | What is Unifesto? | n/a |
| W1 | Video | how to run a college club | How to run a college club: your Space and team in 10 minutes | n/a |
| W1 | Blog | how to organize a college fest | How to organize a college fest: the 8-week checklist | `how-to-organize-a-college-fest` |
| W1 | Comparison | google forms for event registration | Google Forms for event registration vs Unifesto | `unifesto-vs-google-forms` |
| W2 | Video | how to sell event tickets online | How to sell event tickets online: tickets, groups and coupons | n/a |
| W2 | Blog | team registration form | Team registration form for college fests (template + a better way) | `team-registration-form` |
| W2 | Comparison | townscript alternatives | Townscript alternatives: Unifesto vs Townscript (2026) | `unifesto-vs-townscript` |
| W3 | Video | how to organize a hackathon | How to organize a hackathon in college with Unifesto Sprint | n/a |
| W3 | Blog | hackathon judging criteria | Hackathon judging criteria: rubric template and how to run judging | `hackathon-judging-criteria` |
| W3 | Comparison | devfolio alternatives (also: hackathon platform india) | Devfolio alternatives: Unifesto vs Devfolio for hackathons in India | `unifesto-vs-devfolio` |
| W4 | Video | how to collect payment for an event | How to collect payment for an event and see what it earned | n/a |
| W4 | Blog | how to get sponsors for college fest | How to get sponsors for a college fest (with a pitch template) | `how-to-get-sponsors-for-college-fest` |
| W4 | Comparison | konfhub alternatives (also: konfhub pricing) | KonfHub alternatives: Unifesto vs KonfHub pricing and features (2026) | `unifesto-vs-konfhub` |
| W5 | Video | event check in app | Event check in app: QR passes, WhatsApp groups and certificates | n/a |
| W5 | Blog | event day checklist | Event day checklist for organisers | `event-day-checklist` |
| W5 | Comparison | eventbrite alternatives | Eventbrite alternatives for events in India: Unifesto vs Eventbrite | `unifesto-vs-eventbrite` |
| W6 | Video | unifesto 5 | Unifesto 5: first look | n/a |
| W6 | Blog | unifesto 5 | What's coming in Unifesto 5 | `whats-coming-in-unifesto-5` |
| W6 | Comparison | luma alternatives | Luma alternatives: Unifesto vs Luma for events (2026) | `unifesto-vs-luma` |
| W7 | Video | unifesto app | Unifesto app: version 5 is here | n/a |
| W7 | Blog | unifesto 5 release notes | Unifesto 5 release notes | `unifesto-5-release-notes` |
| W7 | Roundup | best event ticketing platform in india | Best event ticketing platforms in India (2026): for college fests, clubs and hackathons | `best-event-ticketing-platforms-india` |

Not in the weeks yet: **Unstop** shows up in hackathon searches ("how to host a hackathon on unstop", "unstop alternatives"); add `unifesto-vs-unstop` after W3 or name it in the Devfolio post. Short and carousel captions reuse the week's video query.

**Recurring short formats:** "Event day in 30 seconds", "Organiser POV", "Spreadsheet vs Space" (before/after), "Shipped this week" (founder, web/Space only until 2 Dec), "Fest of the week" (with permission).

| # | Item | Status |
|---|---|---|
| P0 | **"What is Unifesto?" video on YouTube.** "What is Unifesto?" video on YouTube, link shared on Instagram + LinkedIn. Cut it into the first 2–3 shorts for W0 | done |
| P1 | **Social accounts set up with one handle everywhere.** Accounts ready: YouTube channel art + playlists (Guides, Shorts, Launch), IG + LinkedIn bios, link-in-bio page on web (`/links`, bios link `/links?utm_source=<channel>`), same handle everywhere | in progress |
| P2 | **Content templates on the cosmos look.** Templates (not Canva): carousel (how-to + story), short cover, YT thumbnail, LinkedIn video frame, countdown story, all on the cosmos look | next |
| P3 | **Baseline growth metrics recorded weekly.** Baseline: followers per channel, weekly site visits, Spaces + events created, app installs. Record in a sheet every Monday; set targets after W1 | next |
| P4 | **Content bank of demo Space recordings and photos.** Content bank: screen-record Space flows on a demo Space with seed data (no real attendee data on screen), collect organiser OKs + event photos. Demo Space script: `backend/scripts/demo-space.ts` (`--owner=<email>` to create, `--remove` after recording) | in progress |
| P5 | **W1–W2 content published.** W1–W2 published (2 long, 6 shorts, 4 carousels, 6 LinkedIn, 2 blogs, 1 email) | planned |
| P6 | W3–W4 published | planned |
| P7 | **W5–W6 published and launch assets approved.** W5–W6 published, teaser running; launch assets drafted and approved by 24 Nov | planned |
| P8 | **Launch kit ready by 27 Nov.** Launch kit ready by 27 Nov: launch video, 3 shorts, carousel, LinkedIn founder post + video, blog release notes, email, push copy, store screenshots/what's-new text matching the video | planned |
| P9 | **Launch day on 2 Dec: publish across all channels.** after both stores show 5.0.0 live, publish in this order: YouTube, blog, LinkedIn (founder then company), IG carousel + stories, email to all users, push via Apex broadcast. Then reply to every comment that day | planned |
| P11 | **Comparison blogs against rival platforms.** Comparison blogs (rules): "as of <date>" on every price/feature, link each rival's public pricing/feature page, a "where X is better" section (we're INR-only, no live polls/Q&A yet, no built-in audience), our gaps never hidden, no rival logos, no claims about features we haven't deployed. Our side uses the fees from `/pricing` (`PLANS` in `websites/web/src/lib/site.ts`). Slugs `/blog/unifesto-vs-<x>`; later: Zoho Backstage, Explara, BookMyShow | planned |
| P12 | **SEO and AI search basics already live.** `robots.ts` allows every AI crawler (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…); `/llms.txt`; JSON-LD for Organization, WebSite, MobileApplication, WebApplication, Event, Space, FAQ, Breadcrumb; sitemap with events + spaces | done |
| P13 | **Close blog SEO gaps before the first post on 21 Oct.** Blog SEO gaps, **before the first blog on 21 Oct**: each `/blog/<slug>` in the sitemap (only `/blog` is today), `BlogPosting` JSON-LD (author, dates, image), canonical, RSS; blog + comparison posts listed in `llms.txt`. Overlaps K2/K3 | done |
| P14 | **Search Console and Bing Webmaster Tools verified.** Google Search Console + Bing Webmaster Tools verified, sitemap submitted, IndexNow pinged on publish. Bing matters: ChatGPT search and Copilot read Bing's index | done |
| P15 | **Keyword map for every blog and video.** Keyword map: one search query per blog and video, e.g. "college fest registration app", "hackathon platform India", "event ticketing with Razorpay", "Townscript alternative", "KonfHub alternative", "Devfolio alternative". Title, H1, slug, YouTube title match it | done |
| P16 | **Write blog posts that AI can quote.** Write posts so AI can quote them: first 2 sentences answer the query directly; one fact per sentence; tables for comparisons; FAQ block (FAQPage schema) at the end; "as of <date>"; real numbers from `PROOF` in `site.ts` | done |
| P17 | **Same company facts on every profile.** Same facts everywhere: one-line description, founding city, the numbers, pricing. Website, LinkedIn, YouTube about, Instagram, both app stores, Crunchbase, Wikidata, Google Business Profile | in progress |
| P18 | **Get mentioned on review sites and communities.** (chatbots trust other sites more than ours): list on G2, Capterra, SaaSworthy, AlternativeTo (as an alternative to Townscript, KonfHub, Devfolio, Eventbrite, Luma), Product Hunt launch on 2 Dec; ask 10 organisers for reviews; honest, disclosed answers on Reddit/Quora fest + hackathon threads; college newspapers and club newsletters | next |
| P19 | **YouTube videos optimised for search.** YouTube for search: titles from P15, chapters, uploaded captions, description with summary + tracked links. Google AI Overviews cite YouTube often | planned |
| P20 | **Measure AI search visibility every 2 weeks.** Measure every 2 weeks: fixed list of ~15 prompts ("best app to run a college fest in India", "Townscript alternatives", "how to run a hackathon in India"…) in ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews; note whether Unifesto appears, its position and the cited source. Plus Search Console clicks/impressions and visits from chatgpt.com / perplexity.ai. Nobody can guarantee a top spot; this shows what is working | planned |
| P10 | **Post-launch review and 5.x plan.** Week after: "what we learned launching 5", thank-you post to organisers, review numbers against P3 and set the 5.x plan | planned |
| P21 | Wikidata item for Unifesto, once P18 brings independent coverage to cite (items without sources get deleted); then add it to `SOCIAL`/`sameAs` | planned |
| P22 | Google Business Profile: verifiable address (Malla Reddy University R&D Center) or a service-area business; category Software company | planned |
| P23 | **Keep the demo Space out of metrics and mask payout details.** 1. The demo Space's Event Settings payout dropdown shows a real SBI account holder's name and a team member's full UPI ID. | planned |

### T · Deals, billing and access (2026-10-16)

From the IAM / plan / billing / fee analysis on 2026-10-16. Clients get different deals (custom fee %, organiser absorbs the fee, free or comp plans, one-off event deals), so commercial terms move out of code and plan rows into a versioned **Deal** (D8). The plan rate card is the default deal. Fees are stored as basis points (250 = 2.5%) and money as paise integers.

Terms resolve in this order: **active event deal → active space deal → rate card of the space's plan**. One `quote()` turns base price + terms into `{ buyerFee, organiserFee, total }`, and every paid row stores the result.

| # | Item | Status |
|---|---|---|
| T1 | **Close Co-Curator escalation to money.** `publishEvent`/`cancelEvent` check `EVENT_EDIT` only (Co-Curator can publish/cancel). `addTeamMember`/`removeTeamMember` check `EVENT_EDIT` and accept CURATOR, so a Co-Curator can make themselves Curator (gets `EVENT_MANAGE_MONEY`) or remove the Curator. Require `EVENT_PUBLISH`/`EVENT_CANCEL`/`EVENT_ASSIGN_CREW` | next |
| T2 | **Enforce one role-assignment rule and drop hand-rolled checks.** `canAssign(actor, role)`: only grant roles below your own; CURATOR only by Space Admin or ADMIN; never your own role. Replace ~10 hand-rolled role checks (`event-access.ts`, sessions, check-in, help desk, `spaces.service.ts` `SPACE_ADMIN_TIER`, transfers) with `assertCan` so platform ADMIN inherits. Drop CURATOR's space-scope grants (`space:manage-email/sponsors` 403 today). Revoking a role's last grant leaves it empty (no compiled fallback). Policy comment matches D9 | planned |
| T3 | **Serve one access endpoint and share the IAM cache.** `GET /spaces/:id/access` returns effective capabilities + plan features for any member. Space app drops the hard-coded `rbac.ts` map and the `/usage` features call (non-billing members see every gated nav item today). Capability + plan caches carry a Redis version stamp so edits reach every replica | planned |
| T4 | **Add the Deal model and term resolution.** `Deal` (spaceId, optional eventId, plan, planPricePaise: null = rate card / 0 = comp, billingCycle, buyerFeeBps, organiserFeeBps, validFrom, validUntil, note, createdBy). Rate card = `buyerFeeBps`/`organiserFeeBps` on `PlanConfig` (replaces dead `processingFeePercent`). `TermsService.resolve(spaceId, eventId, at)`. Backfill: every space gets terms equal to today's behaviour (5% buyer, its revenue share as organiser fee), so nothing changes until a deal is edited. `REVENUE_SHARE` billing model becomes `organiserFeeBps` | planned |
| T5 | **Quote every checkout path from one function.** `quote(basePaise, terms)` in integer paise, used by main checkout, legacy register, manual-add link, waitlist, group seat add-on, sessions, stays. `POST /quote` for web and mobile (mobile stops computing `base × 1.05`). Each paid row stores `dealId`, `buyerFeePaise`, `organiserFeeBps`. Old 4.0.5 app still shows a 5% estimate (Razorpay charges the right amount): Apex warns when a deal's buyer fee is not 5% until 2 Dec. `quote()` takes an optional coupon so every buyer-paid path can accept one; turn it on for waitlist claims and sessions (main checkout only today) | planned |
| T6 | **Settle money from per-row snapshots, sessions included.** One `settle(rows)` feeds payouts, financials, Space Transactions page and CSV export, using each row's stored terms (deal changes never rewrite the past). `Payout` gets `sessionId` (exactly one of event/session) so Huddle revenue can be paid out. Forced reconcile books what was actually captured: short lowers `totalAmount`; over goes to the organiser's base, not to our fee (today the platform keeps it). Event and space dashboard revenue (`events.service.ts:3221`, `spaces.service.ts:2340`: PAID only, refunds ignored) reads `settle()` too. Drop the per-payout `platformFeePercent` override (`payouts/dto`): the deal is the only rate | planned |
| T7 | **Build the Apex Deals page.** Per space: current terms, deal history, new version (space or one event), live quote preview, required end date on comp plans. Every change goes to the audit trail (F5) | planned |
| T8 | **Fix the subscription lifecycle.** Status from dates, not `isActive`: ACTIVE → GRACE (7 days) → EXPIRED (STARTER entitlements, data kept). Period end = max(now, current end) + cycle (fixes calendar-boundary expiry). Cancel at period end. Razorpay `order.paid` webhook activates (receipt ≤ 40 chars). Price from the deal. Apex records offline payments (bank transfer). MRR from payments, not typed amounts. Plan changes: upgrade now, pay the difference for the rest of the period; downgrade at period end (no refund). Expiry, renewal and every plan change run in one transaction with a `SubscriptionHistory` row (expiry writes none today). Includes A1 checkout UI | next |
| T9 | **Enforce every plan limit with one entitlement check.** `assertFeature`/`assertLimit` read `TermsService` plan + subscription status. Missing subscription row is created as STARTER (no fail-open/closed/500 mix). Enforce attendees per event, co-curators, spaces, waitlist, WhatsApp blast, recurring events | planned |
| T10 | **Remove dead pricing config.** Drop `platform_config.processing_fee_percent`, `razorpaySubId` and stale Apex subscription API fns. `PlanConfig.processingFeePercent` stays as A9's `platformFeePercent` (D10), with its Apex/mobile edit screens. `/pricing` reading `/subscription/plans` lands with A9 | planned |
| T11 | **Store tax and gateway fees on each sale.** `gstPaise` + place of supply on the snapshot, GSTIN on the space; 0 until the CA check. Store `gatewayFeePaise` + `gatewayTaxPaise` from reconcile (Razorpay's ~2% + GST comes out of our fee) so A5/A7 report true take rate. Invoices and GSTR export stay in A6 | planned |
| T12 | **Finish the IAM hardening leftovers.** `RolesGuard` passes on a role held anywhere: check scope or retire it for `@Can`. `UserRole` unique allows duplicates (NULL space/event ids): make it `NULLS NOT DISTINCT` after a dedupe. Space-member DTOs accept `ADMIN`: restrict to space roles. Money routes in `payouts.controller.ts`/`refunds.controller.ts` get `@Can` on top of the service checks. Delete the stale "compiled shims" comment in `capability-config.service.ts` | planned |

### Parked and dropped

| Item | Status | Why |
|---|---|---|
| Project management system inside Apex (v4 W8) | in progress | Un-parked 2026-10-14 as a small board, not a full PM product: Apex → Product (tracks, tasks, activity) + `/pm/mcp` so Claude Code reads and updates it. Branch `claude/pm-dashboard`. |
| Stays: new features | parked | Niche. Check real booking counts before investing; keep it working. |
| White-label request queue | dropped | Replaced by plan-gated self-serve + suspend (H). |
| App Clip | dropped | Removed 2026-10-08. |
| Wallet, referral, event chat, hack app | dropped | Removed in v4. Only cleanup remains (Track 0). |
| Multi-currency / international payments | parked | Only when expanding beyond India. |
| Merge low-value Space pages: white-label → Settings, partners → Tracking, occurrences/sub-events/co-hosting behind "Advanced" | done (X7) | From the audit; do it alongside H and G. |

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
- **2026-10-14** · Track S built in 4 lanes (S1–S13, S15–S22, S24–S41, S43, S44, S47 done; S14 + S23 partial), adversarially reviewed on auth/payments/money/refunds, merged in #110. Backend jest 734/734. 9 additive migrations `20261015100000`–`20261015160000`. Not deployed. Follow-ups logged as S48–S56; S42 + S46 still open.
- **2026-10-14** · Track O phase 2 + O1 + O6 merged in #109 (O1 is a native change, rides 5.0.0). `OTA-safe` CI check live; secrets `GOOGLE_MAPS_ANDROID_API_KEY` + `OTA_STATUS_SECRET` added; `native` label created. Migrations `20261015220000`, `20261015230000`. Not deployed.
- **2026-10-14** · Track P added: marketing plan to the 5.0.0 launch (YouTube, Shorts/Reels, Instagram, LinkedIn, blog, curator email, outreach), weekly themes W0–W7, launch-day order.
- **2026-10-14** · P0 done: "What is Unifesto?" posted on YouTube, link shared on Instagram + LinkedIn.
- **2026-10-14** · P11 added: one "Unifesto vs X" comparison blog per week (Google Forms, Townscript, Devfolio, KonfHub, Eventbrite, Luma, then a roundup at launch).
- **2026-10-14** · P12–P20 added: SEO + AI search plan. Already live: AI-crawler robots, llms.txt, most JSON-LD. Gap before the first blog: blog posts missing from sitemap + no BlogPosting schema (P13).
- **2026-10-14** · Apex Product board + Claude MCP endpoint built on `claude/pm-dashboard` (migration `20261016100000_product_management`, `backend/src/pm`, Apex `/dashboard/product`). Not deployed. After deploy: create a token in Apex, add the MCP server in Claude Code, have Claude import this file's tracks.
- **2026-10-15** · P15 keyword map added under the P weeks (autocomplete-checked; W2 blog retargeted to "team registration form", W3 blog to "hackathon judging criteria", W7 roundup to "best event ticketing platform in india"). P13 (#126) and P14 (#127) in review.
- **2026-10-15** · P13 done (#126): per-post sitemap, `BlogPosting` + breadcrumb JSON-LD, `/blog/rss.xml`, blog list in llms.txt. P16 done (#130): GFM tables (were raw pipes) + `FAQPage` JSON-LD from a `## FAQ` section. P14 code done (#127, IndexNow on blog changes, prod only); Search Console + Bing set up by hand; P14 done. Deploy web before backend.
- **2026-10-15** · P17 (#131): one `SOCIAL` list feeds the footer + Organization `sameAs` (adds IG + LinkedIn); mobile X link was a 404 (`HeyUnifesto`). Paste-ready profile copy on the board. YouTube missing from `sameAs`: `@unifesto` is someone else's channel. P18 kit on the board; first step is the Product Hunt maker account (~30 days of activity before 2 Dec).
- **2026-10-15** · P17 profiles updated by hand: Instagram, LinkedIn, App Store promo text, Crunchbase (logo, descriptions, phone). Store long descriptions moved to P8; Wikidata and Google Business Profile split out as P21 and P22.
- **2026-10-16** · S57: App Review test login moved from the `APP_REVIEW_LOGIN_ENABLED` env flag to an Apex toggle (App version page); `platform_config.app_review_login_enabled`, default off, read fresh per login so every replica sees it.
- **2026-10-16** · P4 started: `backend/scripts/demo-space.ts` seeds a PRIVATE PRO demo Space (Aurora Tech Club) with a team, 4 events and ~110 fake attendees (`+0999` mobiles, `demo.N@example.com`) for screen recordings; `--remove` deletes it all.
- **2026-10-16** · P4 demo Space seeded on prod (`aurora-tech-club-demo`, PRIVATE). P1 link-in-bio page `/links` (noindex, latest blog post auto-listed); bios should link `https://www.unifesto.app/links?utm_source=instagram` (or `linkedin`, `youtube`).
- **2026-10-15** · Task rows now lead with the board's short title in bold (175 rows); full text kept after it. Board task view opens read-only (#132); apex + web deployed.
- **2026-10-16** · Track D rebuilt as **Unifesto Assist** (D1–D28): one case wrapper over support, refunds, cancellations, the 10 request types, a new event request, ticket issue reports, payouts, privacy and grievance, plus a Claude Haiku 5.5 layer (est. ~$6/mo now, ~$55 at 10×). Old D1–D8 folded in; B7, B9, B11 merged; B10 dropped for 0.9; K7 narrowed to legal pages. Decision D7 added.
- **2026-10-16** · Assist decisions settled: event request = host without a Space; support inbox default curators only; no auto-escalation.
- **2026-10-16** · Track R added: IAM / plan / billing / fee analysis turned into a deal-based design (D8: plan, deal and role are separate; D9: Space Admin + Curator move money). R1 is a live escalation (Co-Curator can make themselves Curator). A1 is built inside R8.
- **2026-10-16** · S23 finished: the last hand-rolled Space Admin gates (registrations, waitlist, check-in, sessions, event attach/transfer/co-host) now go through `AuthorizationService.can`, so Platform Admins and event curators get in where the matrix says. S14 closed; its `cancelEvent` refund flow lives in D6. X1 closed (board live since #116/#123/#132).
- **2026-10-16** · Assist D1 (case model), D2 (access, routing, escalation) and D4 (private attachments) built in #147. Space desk reads only cases that are or were on it; no crew contact in threads. Needs migrate deploy + rebuild backend.
- **2026-10-16** · Track H fixes in #146: H24 (.ics links to custom domain), H22 (larger square logo + name), H12 (mobile brand font), H20 guard (403 on Resend domain limit; upgrade still needed). Backend jest 79/79 (email, white-label), mobile tsc green. Deploy: rebuild backend + web + space; H12 needs mobile build/OTA.
- **2026-10-16** · Track S finished in 4 lanes: #156 (S48, S49, S53), #157 (S50, S51, S52 money parts), #158 (S42 dormant schema, S54, S56), #159 (S45, S46, S52/S42 registration parts). Decisions: blank sponsor overrides inherit; only EMAIL/GOOGLE/APPLE identity emails stay trusted. Left: drop `group_members` once checkout creates seats directly. None deployed.
- **2026-10-16** · Track S deployed (main 9840e37): prod schema up to date at 152 migrations, all backend replicas + cert-worker + space healthy. 
- **2026-10-16** · S42 finished in #162: group seats created at checkout, `group_members` dropped; deployed two-step, prod 153 migrations up to date. Track S complete.
- **2026-10-18** · C1 in-app inbox: every user push now keeps a `user_notifications` copy by default (was hackathon/competition only; staff alerts and opted-out promotions excluded), mobile bell with unread badge on Home opens `/notifications` (reuses the hackathon feed screen). No migration. Deploy: rebuild backend; mobile is JS-only, rides 5.0.0.
- **2026-10-18** · A4 money-path review done (payments, refunds, payouts, reconciliation, webhooks). S9–S16 fixes hold. New: A13 (P0 live, webhook trusts buyer-set notes + no amount check), A14–A16 + A21 next, A17–A20, A22–A23 planned.

- **2026-10-18** · Platform audit (backend, mobile, Space, Apex, web: 30 code slices, 978 findings with 1 critical and 66 high verified, 492 medium; visual audit of web, Space, Apex and the iOS app; market analysis over 15 domains) turned into board work. Track R (Deals, billing and access) renamed **T** because board key R is the 5.0.0 release track: R1–R12 are now T1–T12. 63 new tasks, 99 updates. A16, C1, E6, K4 done; A18 and G6 dropped; A8, C7, D16, D18, D28, E2, E4, G7, H9, K7, M2, M4, N2, N3 parked. NEXT batch: J13, T1, T8, A19, A24, A25, J8–J12, K8–K10, D29, O17.
- **2026-10-18** · Stale rows fixed after the audit: Now › H (H8/H10/H11 were done), Suggested order drops finished S, O7–O16, A1–A3, Track 0, B1–B3 and H P1–P3 and is renumbered; A13 (#183), A14 + A15 (#184) done, not deployed; B1–B3 marked live (#153–#155).
- **2026-10-18** · Track A started, one PR per item, merge in order: A19 (#190) cancel-not-delete checkout cleanup + payment link id; A25 (#191) REFUND_FAILED status, claim kept on ambiguous refunds, payouts hold open refunds, server refund cap; A24 (#192) cancel refunds base-only + payout block + Apex "Refund all paid"; A21 (#193) fee % frozen per sale by a Postgres trigger. Backend jest 881/881 on Node 24. Migrations 20261022100000, 110000, 110100, 120000. None deployed.
- **2026-10-18** · Track A batch deployed (main e905fef): A19, A25, A24, A21 live; `refund-all` route answers on prod. Next in A: run the #192 SQL for cancelled events still holding paid money, then the A9 and A12 pricing decisions.
- **2026-10-18** · A9 open questions settled (D10): rates in `plan_configs.platformFeePercent`, read by the resolver, the A21 trigger and `/pricing`; GROWTH retired at Starter's rate; an admin edits rates when the launch offer ends. T10 narrowed to match.
- **2026-10-18** · A9 built (#199): plan rates in `plan_configs.platform_fee_percent` at 0% until an admin sets them, GROWTH retired, public rate card `GET /config/plan-fees` feeds `/pricing` and `/llms.txt`. Open: launch rates are promised as locked before 31 Mar 2027, which needs per-space terms (Track T) before the rates rise.
- **2026-10-18** · A12 decided (D11): buyer fee stays 5% with a ₹99 cap (A34), per-event absorb toggle (A33), copy says what students pay and organisers keep (A11). Unifesto isn't GST-registered yet; GST treatment waits for registration and the CA (A6). A9 merged (#199), not deployed.
- **2026-10-18** · Track B started in worktree `.claude/worktrees/track-b`, one PR per item. B4 (#201): Space event settings gets an Attendees card (team changes + lock time, attendee detail edits + close time), same switches as mobile. No migration; rebuild space.
- **2026-10-18** · A34 built (#202): buyer fee min(5%, ₹99) per ticket in `computeProcessingFee`, served to web and mobile; stays count each guest, a flat-priced group counts as one ticket.
- **2026-10-18** · Track D: D3 built (#203). Case events push, in-app and email the other side (Platform desk gets staff push only); opening a thread reads it; unread dots + counts in mobile, Apex and Space. Data-only migration 20261024100000 backfills read state. Backend jest 106/106 on Node 24. Not deployed.
- **2026-10-18** · Track D: D12 built (#205). `backend/src/ai` `AiService.run()` on `claude-haiku-5-5`: cached system prompt, per-feature max_tokens + per-user 24h cap, every call logged in `ai_runs` with USD cost; refusal, truncation or error returns `{ ok: false }` for a human (D7). Features ship dark: `platform_config.ai_enabled_features` is the kill switch (no Apex toggle yet). Migration 20261025100000. Backend jest 917/917 on Node 24. Not deployed.
- **2026-10-18** · B6 (#206): shared search box + pager (`components/shared/ListControls.tsx`, Space and Apex). Search + paging on coupons, sponsor roster, leads, payouts, Apex orphaned payments; paging on sessions, hackathon teams, and the waiting list (was stuck at the first 100); server-side subject search on email campaigns (`?search=`). Members page uses the shared pager. RSVP tiers skipped (a handful per event). Rebuild backend + space + apex.
- **2026-10-18** · A27 built (#207): a free-add approval is now a revocable seat quota on one ticket type or any, drawn atomically by single add, CSV import and curator add-seats. Approvals from before stay unlimited until revoked. The placeholder-mobile part moved to A35. A9 (#199) and A34 (#202) merged, not deployed.
- **2026-10-18** · B5 (#204): exports for waiting list, check-in log and coupon redemptions on the existing event export route (CSV/Excel/PDF, same Growth plan gate and `event:manage-attendees` check); Space members CSV (page now loads every member, was cut at 100); Apex transactions, users (all pages of the current filter), payouts and financials (one row per event) CSV. RSVPs are in the attendee export. Backend jest 897/897. No migration; rebuild backend + space + apex.
- **2026-10-18** · Track D: D13 built (#208). New cases are triaged off the request path by `SupportTriage` (case CREATED event) through `AiService` at effort low with structured output (category, priority, routing hint, language, sentiment, spam, reason) into `ai_triage`. Rules route first: AI fills only a GENERAL category and a NORMAL priority, never the desk, and a staff edit wins. `ok: false` leaves `ai_triage` null. Eval (`backend/scripts/triage-eval.ts`, 21 labelled cases): first run category 20/21, priority 18/21, sentiment 19/21, rest 21/21; after tightening priority (information questions LOW, actions NORMAL, soon or angry doesn't raise it), feedback → GENERAL, and fixing 3 mislabelled cases, 125/126 checks (the miss was a label, now fixed). $0.002 a run (~$0.0001 a case), system prompt cache-read on every case after the first. No migration; ships dark. Backend jest 47/47 (ai + support) on Node 24. Not deployed.
- **2026-10-18** · B16 (#209): blank fields clear (Apex user, Space event edit + content, coupons web + mobile, ticket capacity; Apex subscriptions refuse a blank revenue share and always log the note); Apex events filter by space, a failed /users/me retries instead of 'no access', curators/co-curators/crew go to Space, Space settings save no longer blanks the dashboard, space switcher leaves entity pages, a wrong OTP no longer reloads login; `slug_history` keeps renamed event/space slugs resolving (web redirects), short links follow their target by id. Migration 20261026100000_slug_history. Backend jest 918/918. Deploy: migrate + rebuild backend, space, apex, web; mobile coupon fix is JS-only (rides 5.0.0).
- **2026-10-18** · A31 built (#210): mobile pays whenever the server opened an order and the fake 15-minute hold is gone; legacy `POST /events/:id/register` and the no-op `reserveTickets` lock deleted; cached public events overlay live seat counts; the Space wizard rejects a blank paid price.
- **2026-10-18** · Track D: D8 built (#212). Apex `/dashboard/assist` lists every case with kind tabs, filters (status, desk, priority, assignee, unread), search, paging and a stats header. Typed action panels call the existing refund, request, report and payout-account endpoints. The sidebar shows the D3 unread badge, and `/dashboard/support` redirects to the inbox. Backend jest (support) 43/43 on Node 24. No migration. Not deployed.
- **2026-10-18** · B8 (#213): Apex web gets the mobile-only admin tools: /dashboard/ota (staged rollout raise/promote/revert, roll back, stale-OTA alarm, adoption), /dashboard/default-images (4:3 banners and 1:1 logos with crop), /dashboard/stats-recipients, and on Status an UptimeRobot outside view plus a Recount seats button (was backend-only). Existing endpoints, no backend change; rebuild apex.
- **2026-10-18** · D17 in review (#214): help articles (migration `20261027100000_help_articles`), Apex `/dashboard/help`, web `/help` + `/help/[slug]`, linked from `/support`. Backend jest 943/943. D11 can no longer use `/help` itself to open cases; use `/support` or `/help/contact`. Deploy: `migrate deploy`, rebuild backend + apex + web.
- **2026-10-18** · B17 (#218): event create/update reject bad dates, an end at or before the start, runs over a year, starts over 3 years out and unknown timezones. Recurring occurrences now copy tickets (sale windows shifted, ids stable via `source_ticket_type_id`), ticket blocks, questions (ticket and show-if links remapped), agenda (shifted), speakers, prizes, contacts, FAQs and the event team; later setup edits on the parent re-sync future untouched occurrences (no registrations, not detached), and a setup edit on an occurrence detaches it. Wizard and edit page refuse "repeats until" with no date. Migration 20261027110000. Backend jest 949/949. Deploy: migrate + rebuild backend + space.
- **2026-10-18** · Track D: D9 built (#216). `GET /support/spaces/:spaceId/desk` lists the space desk with the `canSeeCase` rules (Space Admins every case, event teams their `event:manage-support` events, escalated cases read-only) plus a desk unread count. Internal notes go through `POST .../messages` with `internal: true`: current desk only, no status, read-state or notification change. Space `/dashboard/assist` has filters, search, paging, reply, note and escalate behind the new `event:manage-support` nav capability, with the D3 unread badge. Backend jest 954/954 on Node 24. No migration. Not deployed.
- **2026-10-18** · A33 built (#215): per-event "include the processing fee in my ticket prices"; buyers pay the listed price and the 5% fee (max ₹99 a ticket) comes out of the organiser's share; money rights needed to change it; stays and sessions keep the fee on top. A31 (#210) merged, not deployed.
- **2026-10-19** · Track D: D9 follow-up (#220). Event-only operators (Curator or Co-Curator on an event, no space role) now get an Assist inbox link with the unread badge in their rail (`AssistInboxLink`, in `EventAccessNav` and `EventNav`), and the dashboard layout lets them open `/dashboard/assist`; the backend already scopes the list to their events. Crew-only users still don't see it. Space only, no backend change. Not deployed.
- **2026-10-19** · B15 (#221): Space web desk actions that were mobile-only: attendee detail Cancel (free/unpaid) or Raise refund (paid, straight to Unifesto); event Refunds section (curator queue gets `eventId`) and Request payout for Curators too (`event:manage-money`, D9); hidden events open for their operators (Restore/Delete reachable); cancel ONGOING events, status card for ONGOING/COMPLETED; manual add uses the manage ticket list (hidden/paused tiers), enforces required visible questions and accepts +91 phones; Crew can use web check-in (points they're granted, no organiser cards). Roster upload is the existing CSV import; team-change controls shipped in B4. Backend jest 951/951. No migration; rebuild backend + space.
- **2026-10-19** · B19 (#222): certificates: a single revoke is now for cause and survives re-runs and "Reissue all" (`revoked_for_cause`); deleting a template with issued certificates retires it (`deleted_at`) so verify links keep working; CHECKED_IN certifies only the group members actually scanned, each filed under their own account; serials come from one MAX query plus a per-batch counter (was O(n²)); stale batches closed every 30 min; Indian-script names switch to Noto Sans faces when bundled (font files still to add). Reports: a bare 'To' date covers that whole IST day; renders go to cert-worker, one at a time per event. Migration 20261028100000. Backend jest 972/972. Deploy: migrate + rebuild backend (+ cert-worker) + space.
