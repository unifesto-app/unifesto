# Unifesto version 5

The single plan and log for 5.x. **Final deadline: Sun 15 Nov 2026, when 5.0.0 releases on both stores** (moved from Wed 2 Dec on 2026-10-29). Until then only Z8 work runs: events pipeline, revenue, safety fixes, the release and removals. Everything else is parked and moves at its own pace after 15 Nov. This replaces `version-4.md`, every per-feature plan doc, and the October 2026 audit. Everything still open from those has been carried over here.

Covers mobile, backend, and all four websites (web, space, apex, plus the retired hack app's leftovers).

## How to use this file

- **Pick a track** from [Tracks](#tracks) and work through its items. Several tracks can be open at once.
- **Status:** `next` · `planned` · `in progress` · `done` · `parked` · `dropped`. Never delete an item. Mark it `dropped` with a reason instead.
- **When something lands:** don't edit this file in the PR (every PR touching it made every other PR conflict and re-run CI). Put `Log: <one line>` and `Status: <ID> <new status>` lines in the PR body; on merge, `.github/workflows/v5-log.yml` adds the Log line (dated, with the PR number) and sets that row's status on main. Plan edits with no PR go straight to main as a `docs(v5):` commit.
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
| D6 | **5.0.0 goes live on both stores on Sun 15 Nov 2026** (moved from Wed 2 Dec on 2026-10-29). It is the next store build; no store release before it. Whatever is done and device-QA'd by the Fri 6 Nov freeze ships in it; the rest waits for 5.x. |
| D7 | **AI in Assist suggests, never decides.** Claude Haiku 5.5 (`claude-haiku-5-5`) answers, triages, drafts and summarises; it never moves money, approves a request or sends a reply on its own. Any refusal or API error falls back to a human queue. |
| D8 | **Plan, deal and role are three separate things.** Plan = what a space can do (features, limits). Deal = what it pays (plan price, buyer fee, organiser fee), per space or per event, versioned. Role = who can do it. Every paid row snapshots the terms it was sold under, so changing a deal never rewrites past money. See [Track T](#t--deals-billing-and-access). |
| D9 | **Space Admin and Curator both move event money** (payouts, refund approvals). Money lands in the space's bank account, so Space Admins get it officially; Co-Curator and Crew never do. |
| D10 | **Organiser platform fee rates live in `plan_configs.platformFeePercent`** (Starter 2.5, Pro 1.5, Enterprise 1). The backend, the A21 fee trigger and `/pricing` all read that column; Apex Plans edits it. A rate change only affects new sales (A21). GROWTH is retired and pays Starter's rate. When the launch offer ends on 31 Mar 2027, an admin edits the rates. See [A9](#a--money-and-trust). |
| D11 | **Buyer fee stays 5%, capped at ₹99 per ticket; organisers can absorb it per event.** Copy says what students pay and what organisers keep, never "lowest fee". Unifesto isn't GST-registered yet: when it registers, the CA decides whether GST sits inside or on top of both fees, and whether Unifesto counts as an e-commerce operator (compulsory registration, TCS). See [A12](#a--money-and-trust). |

### 5.0.0 · release Sun 15 Nov 2026

Worked back from the date, with room for one store rejection. Moved from Wed 2 Dec on 2026-10-29: 15 Nov is also the final deadline for every open task on the board. Each step's task carries its due date there.

| When | Step |
|---|---|
| Now → Fri 6 Nov | Only Z8 work runs. Native changes merge until the freeze, because they all ride the 5.0.0 build |
| Fri 6 Nov | **Freeze:** native + feature freeze for 5.0.0 (R1). After this, only fixes found in QA |
| Fri 6 → Sun 8 Nov | `eas build --profile production --platform all` (O2), then device QA on TestFlight / internal testing (O3). The organiser beta runs on this build (Z10) |
| Mon 9 Nov | `eas submit` to both stores with **manual release** (R3): App Store "Manually release this version", Play "Managed publishing". Approval then waits for you. Record runtimes from EAS (O4) |
| 9 → 14 Nov | Buffer for review or a rejection fix plus resubmit (R4). Backend changes 5.0.0 needs are deployed and backward compatible with 4.0.5 |
| **Sun 15 Nov** | **Release on both stores** (R5). Publish a tiny 5.0.1 OTA at 20% and confirm a phone gets it (O5). Soft update prompt on (O6) |


---

## Now

| Track | Item | Status |
|---|---|---|
| Z | **Final deadline Sun 15 Nov (re-plan 2026-10-29).** Z1 10 upcoming events published, Z2 organiser fee live Mon 2 Nov, Z3 owners and time split (1 Nov), Z7 weekly scorecard (2 Nov), Z10 organiser beta (9 Nov), Z11 age gate (6 Nov). Z8 decides what else may start | next |
| R, O | **5.0.0 on the [15 Nov schedule](#500--release-sun-15-nov-2026).** Freeze Fri 6 Nov, submit Mon 9 Nov, release Sun 15 Nov. Native work merges by 6 Nov or waits for 5.1: G1, G3, G8, G14, H15, E9, Z11 and the S removals. O0 hotfix lane closes at release; OTA stays blocked until the 5.0.0 runtime is recorded (O4) | next |
| J, A, T, F, S | **Safety and money fixes.** J14 prod secrets off the laptop and A36 Razorpay webhooks (31 Oct, before the fee goes live); deploy J20 + J21 (2 Nov); T2, T11, A35, F8 (10 Nov); T12, A30, J15, S62 (12 Nov); A6 GST invoices (13 Nov) | next |
| S | **Removals and fixes before the freeze.** S61 dead code (3 Nov); S58 recurring series, S60 partner and short links, S64 the 11 known bugs (4 Nov); S59 Stays (5 Nov); S65 smoke tests (9 Nov) | next |
| P, V, U, … | **Parked until after 15 Nov.** All marketing (track P, Z9), V (Space into Web), U4–U9 (company section), F1–F6, E10/E11, K18/K19, J6/J18, T7/T9 and the rest outside Z8. The reason is on each board task | parked |

## Suggested order

There are no dates, only a sensible sequence. Each step makes the next one cheaper.

1. **J13** first: deploy only CI-green `main` with a rollback image. Then the 2026-10-18 audit batch with the next backend deploy: **T1**, **J8–J12**, **A19**, **A24**, **A25** and **T8**'s hotfix. Track S shipped in the 2026-10-16 deploy.
2. **O1–O6** on the [5.0.0 schedule](#500--release-sun-15-nov-2026) (O7–O16 guards are merged). No mobile change reaches users before 15 Nov.
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

**Phase 1: unblock with the 5.0.0 store build (release Sun 15 Nov, see [schedule](#500--release-sun-15-nov-2026))**

Until then, the live 4.0.5 builds get **no** updates: `main` can't target their runtime. Backend changes must stay compatible with 4.0.5 clients until most users have moved.

It's a major because it removes the App Clip.

| # | Item | Status |
|---|---|---|
| O0 | **Hotfix lane on hotfix/4.1 until 2 Dec.** (only if something is badly broken for live users): branch `hotfix/4.1` from `e87540f` (the 4.1.1 OTA commit), cherry-pick the JS-only fix, run `ota:preflight` (it passes on the 4.0.5 runtimes), and publish with the `--skip-bundler` recipe. Never merge `hotfix/4.1` back into `main`; land the same fix on `main` separately | standby |
| O1 | **Batch fingerprint fixes into the next store build.** Batch in fingerprint fixes that need a store build anyway: `platforms: ["ios", "android"]` in `app.config.js` (makes `npm run update:production` work and retires `--skip-bundler`), and `sourceSkips: SourceSkips.PackageJsonScriptsAll` in `fingerprint.config.js` (editing npm scripts never changes the runtime again). Pull in any other native work wanted soon, such as C7 rich push, or consciously leave it for the next window. Land before the 20 Nov freeze | done (#109), live 19 Oct |
| O2 | **Bump to 5.0.0 and run the production EAS build.** Version → 5.0.0; `eas build --profile production --platform all` from `main` after the 20 Nov freeze | planned |
| O3 | **Device QA of the 5.0.0 build on TestFlight.** Device QA on TestFlight / internal testing. This is the first time 76 commits run on a phone. Smoke-test login, Home, event → register free + paid, ticket + QR, group claim, check-in scanner (online + offline), Space tab manage screens, Apex tab, app icon picker, haptics, light/dark, push + deep link | planned |
| O4 | **Record runtimes from EAS build metadata.** Record runtimes **from EAS metadata** (`eas build:list --json` → `runtime.version`), not `ota:record`, which hashes the local tree. Keep the 4.0.5 entries until O6 | planned |
| O5 | **Submit 25 Nov, release 2 Dec, verify a 5.0.1 OTA.** `eas submit` on 25 Nov with manual release; release on **2 Dec**, then publish a tiny 5.0.1 OTA at 20% and confirm a real phone receives it (Profile › About shows the update id) | planned |
| O6 | **Move users off 4.0.x runtimes with update prompts.** Move people off the 4.0.x runtimes, which can never get another OTA. Show a soft update prompt as soon as 5.0.0 is live on both stores, then raise the minimum version to 5.0.0 once most active users have moved (decision for you: how long between soft and hard) | done (#109): soft prompt built, off until latest version is set in Apex › App version on 2 Dec. Gap between soft and hard is still your call |

**Phase 2: make it impossible to repeat**

| # | Item | Status |
|---|---|---|
| O7 | **CI OTA-safe check on mobile PRs.** on every PR touching `mobile/`: run preflight with `GOOGLE_MAPS_ANDROID_API_KEY` as a GitHub secret (the only env var feeding the config). If the PR's head no longer matches a live runtime while its base did, the check fails with "native change: needs a store build" | done (#109), live 19 Oct |
| O8 | **Native PRs wait for the next store-build window.** PRs that change the runtime get a `native` label and stay open until the next store-build window, when they merge together right before the build. JS PRs never wait. Before 2 Dec, native PRs merge normally into the 5.0.0 build. All PRs still base on `main` | done (#109); `native` label created |
| O9 | **PR template shows the OTA-safe CI result.** PR template: replace the free-text "Ships as" with the CI result (OTA-safe ✓ / store build) | done (#109), live 19 Oct |
| O10 | **Record build runtimes from EAS, retire ota:record.** `scripts/ota-record-build.js`: fetch the latest finished production build per platform from EAS and write its runtime to `runtime-fingerprints.json`. Delete `ota:record` | done (#109), live 19 Oct |
| O11 | **One OTA rollout at a time per channel.** Make `update:production` refuse to publish while another rollout on the channel is below 100%. Promote it or revert it first, so one rollout runs at a time | done (#109), live 19 Oct |
| O12 | **Stale-OTA alarm in Apex OTA updates.** Apex › OTA updates shows how many mobile commits on `main` are newer than the last published update, plus whether `main` is OTA-safe. That makes "nothing shipped for 10 days" visible | done (#109), live 19 Oct |
| O13 | **Show OTA update and runtime adoption in Apex.** add `runtimeVersion` + `updateId` to the app-version report (`src/lib/appVersionReport.ts` sends only version + platform today) and a backend column, so Apex shows the share of active users on each update and runtime | done (#109), live 19 Oct server side, mobile in 5.0.0 |
| O14 | **Test promote, revert and republish on preview channel.** Test promote / revert / republish on the `preview` channel once, with an internal preview build. The Apex mutations are still untested. Use the preview channel to QA risky OTAs before production | planned |
| O15 | **Publish OTAs regularly after mobile PRs merge.** Publish habit: OTA whenever a batch of mobile PRs has merged and been checked on a device. Don't let JS sit on `main` unshipped | planned |
| O16 | **Rewrite mobile OTA docs for the new flow.** Rewrite `mobile/docs/OTA.md` for the new flow (drop the `--skip-bundler` section, add the native-window rule, record-from-EAS and the one-rollout rule) | done (#109), live 19 Oct |
| O17 | **Clear store review risks and land native fixes before the freeze.** Everything native must merge before the Fri 20 Nov freeze (R1); | done (mobile; Apple token revoke is the separate backend PR) (#289) |

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
| A9 | **Charge the plan platform fee to organisers (2.5 / 1.5 / 1%).** Rates in `plan_configs.platformFeePercent` (renamed from `processingFeePercent`), read by the resolver and `platform_fee_percent_for_event`; GROWTH hidden, pays Starter's rate; `/pricing` reads `/subscription/plans`. Migration ships the rates at 0 and an admin sets them in Apex once A10's notice is out, so deploying is not going live (D10) | done (#199), live 19 Oct: ships at 0%; go live = A10 notice, then set rates in Apex Plans |
| A10 | **Notify existing organisers before the platform fee starts.** | done (#228), live 19 Oct: fee starts Mon 2 Nov 2026; email from Apex on 19 Oct; set rates in Apex Plans on 2 Nov |
| A11 | **Site states both fees everywhere (extend PR #180).** | done (#370) |
| A12 | **Pricing decisions from the India price-sensitivity analysis.** | done: decided 2026-10-18 (D11); builds are A33, A34; GST waits for registration (A6) |
| A13 | **P0 live: webhook settles any registration from buyer-set notes, no amount check.** `resolveRegistrationIdForOrder` reads `paymentData.notes.registrationId` (set by the browser in Checkout) before the server-fetched order notes (`registration-payments.service.ts:511`); nothing compares captured `amount`/`currency` to the row. Pay ₹1 on any unmatched order (e.g. a session) with notes → a ₹5000 ticket goes PAID. Same in stays (`stay-bookings.service.ts:651`) and seat add-ons (`team-changes.service.ts:457`). Fix: only `fetchOrderNotes(orderId)`; require `amount === razorpayAmount*100` and INR before any claim | done (#183), live 19 Oct |
| A14 | **Refund idempotency after a lost Razorpay response.** Any error from `payments.refund` (incl. timeout after Razorpay accepted) is treated as "nothing moved" and the claim released (`refunds.service.ts:546-558`, `:471-480`) → re-approve refunds twice. Auto-refund crons (registrations, sessions, seats, stays) retry forever on the same case. Stuck PROCESSING has no exit and blocks new requests. ₹0 refunds get marked APPROVED (`:566-580`). Fix: `X-Refund-Idempotency` keyed by request id; on non-4xx keep PROCESSING and check Razorpay refunds by `notes.refundRequestId`; admin "resolve stuck refund"; throw on `refundedNow === 0` | done (#184), live 19 Oct |
| A15 | **Handle `refund.processed` / `refund.failed` webhooks.** None handled: a refund that fails later stays REFUNDED/APPROVED with seats released, attendee never paid | done (#184), live 19 Oct |
| A16 | **Paid sessions: lockout and webhook confirm.** Pending paid row defaults to `status=REGISTERED`, so after closing the payment sheet every retry says "Already registered" (`sessions.service.ts:762`). Webhook only logs session captures (`registration-payments.service.ts:603`): app killed before verify = captured, no seat, no refund. Fix: reuse/reissue order for PENDING/FAILED rows; webhook runs the same claim as `verifyPayment` | done (#185), live 19 Oct |
| A17 | **Session revenue in payouts and financials.** `Payout.eventId` is required and payouts/financials/timeseries never read `sessionRegistration`: session money can't be paid out or seen. Fix: session payout source (nullable eventId + sessionId) folded into the aggregates, or block paid sessions until then | planned |
| A18 | **Plan upgrade: server-side activation.** Only client verify activates (`subscription.service.ts:198`); a captured `sub_` payment via webhook is logged as unrecorded. Fix: webhook branch on `notes.spaceId`+`plan` calling the idempotent activation (unique `subscription_history.payment_id`); add plan payments as a reconciliation source (now false MISSING_IN_PLATFORM). Overlaps T8 | dropped (2026-10-18): merged into T8 (doc R8 already includes order.paid webhook activation; |
| A19 | **Stop checkout cleanup from deleting link, paid and waitlist rows.** Manual add with "collect payment" leaves `orderId` null and never stores the link; in-app checkout then deletes the row (`registration-checkout.service.ts:806`, `:288`) and a later link payment is orphaned or double-charged. Fix: store link id, cancel not delete, cancel the Razorpay link when the row is cancelled/superseded | done (#190), deployed |
| A20 | **Overdrawn event doesn't block payouts on the space's other events.** `computeBalance` / `createPayout` ceiling are per event (`payouts.service.ts:262`, `:966`); a refund after payout leaves event A overdrawn while event B pays out in full. Space Financials already nets it, payouts don't. Fix: subtract other events' overdrawn total under the lock. Also check bank account belongs to the event in admin `createPayout` (`:947`) | done (#233), live 19 Oct: debt netted once across the space (`available − max(0, debt − other events' unpaid)`), reason in the error, per-space lock, admin account must be eligible |
| A21 | **Freeze the platform fee per sale.** Every balance and financials path applies today's `resolvePlatformFeePercent` to all past revenue: a plan or default-rate change rewrites history and unlocks withdrawable money. Store the fee % (or paise) on each paid row at capture. Prerequisite for A9's go-live cutoff | done (#193), deployed; trigger freezes the rate, A9 must replace `platform_fee_percent_for_event` |
| A22 | **Duplicate captures on an already-paid row are kept silently.** Two tabs paying the same waitlist offer or stay booking: second capture logged "already paid" (`registration-payments.service.ts:620`, `stay-bookings.service.ts:684`), no refund. Fix: different `paymentId` on a PAID row → error log + full auto-refund | done (#233), live 19 Oct: `PaymentsService.refundIfDuplicate`, keyed `dup:<paymentId>`, fee included; events (verify, webhook, waitlist), stays, seat add-ons, sessions. Left: mobile 'payment received, confirming', superseded-checkout captures |
| A23 | **Reconciliation and reporting accuracy.** `truncated` ignored past 2,500 payments and not returned for refunds/settlements; `safe()` turns a failed fetch into `[]` (balance overstated, `approximate` false); date windows are UTC not IST (`reconciliation.service.ts:54`); platform refunds matched only by `razorpayRefundId` (auto refunds show as Razorpay-only); financial timeseries counts event registrations only (`admin.service.ts:496`); platform fee rounded per space vs per event/row (paise drift) | planned |
| A24 | **Refund cancelled events and hold their payouts.** Stopgap ahead of D6 (Assist wraps it later). | done (#192), deployed; base only, fee kept. Left: run the cancelled-events SQL from #192 and Refund all paid for each hit |
| A25 | **Close the gaps left in A13, A14 and A15.** Follow-ups to the DONE fixes in #183 and #184. | done (#191), deployed |
| A26 | **Add confirm dialogs to the remaining irreversible actions.** A2 (DONE) missed these; each still fires on one tap. | done (#235), live 19 Oct server side, mobile in 5.0.0: shared ConfirmDialog; bulk sends show a server count and a send-to-me test; min ≤ latest app version enforced |
| A27 | **Close free-seat loopholes on paid tickets.** Paid seats can be given away with no fee. | done (#207), live 19 Oct: free-add approvals are revocable seat quotas; old approvals stay unlimited until revoked |
| A28 | **Fix group seat edits, transfers and member data.** Money (high, confirmed). | done (#234), live 19 Oct: team changes need a booked group, admin transfer moves seat 1, members see only their own seat, typed-in teammates get their own ticket, claims need a verified email, Allow next N skips a group that doesn't fit; QR follow-up in review (#238): transfer and a shared-QR teammate leaving rotate the QR |
| A29 | **Stop series edits and deletes from cascading money rows.** S14 (DONE) guarded event delete, but other paths still lose paid data. | done (#236), live 19 Oct server side, mobile in 5.0.0: money FKs RESTRICT + one `deleteWithoutMoney` guard; series edits never delete a booked occurrence; series parents never auto-complete. Migration 20261029143700 |
| A30 | **Re-home payouts and roles on event ownership transfer.** acceptOwnershipTransfer moves only spaceId (backend/src/events/events.service.ts:1114-1131); | planned |
| A31 | **Make checkout trust the server total and stock.** - Mobile skips payment and shows 'You're going' from its own computed total even when the server created a paid order (mobile/src/hooks/useEventRegistration.ts:572-574). | done (#210), live 19 Oct (server; mobile rides 5.0.0) |
| A32 | **Add UTR, payer record and notices to manual payouts.** Manual payouts (RazorpayX was removed) lack basics. | done (#341) |
| A33 | **Organisers can absorb the buyer fee, per event.** "Include the fee in my ticket price": the buyer pays the listed price and the fee comes out of the organiser's share (₹500 → base ₹476.19). Refunds stay base-only. After A31; mobile parts before the 20 Nov freeze (D11) | done (#215), live 19 Oct; mobile part must merge before the 20 Nov freeze |
| A34 | **Cap the buyer fee at ₹99 per ticket.** min(5%, ₹99) per ticket in `computeProcessingFee`, served to web and mobile; applies above a ₹1,980 ticket (D11) | done (#202), live 19 Oct |
| A35 | **Keep the mobile a curator types for imported and manually added attendees.** New accounts get a placeholder mobile and the typed one is dropped, so lists, exports and WhatsApp use a fake number. Store it on the registration and prefer it where the account mobile is a placeholder; never make it the account mobile. Split from A27 | planned |

### B · Operator productivity

| # | Item | Status |
|---|---|---|
| B1 | **Announce-to-attendees button on Space event page.** button on Space event page (backend `POST /events/:eventId/announcements` exists, no UI) | done (#153), live |
| B2 | **Bulk check-in in Space.** Bulk check-in in Space (`POST /checkin/event/:id/bulk` + client `registrations-api.ts:850` exist) | done (#154), live |
| B3 | Session edit after create in Space (`updateSession` exists) | done (#155), live |
| B4 | **Team-change window toggle in event settings.** Team-change window toggle (`PATCH /events/:eventId/attendee-controls`) in event settings | done (#201), live 19 Oct |
| B5 | **CSV exports for Space and Apex lists.** CSV export. Space: members, rsvps, waitlist, coupon redemptions, check-in log. Apex: transactions, payouts, financials, users | done (#204), live 19 Oct |
| B6 | **Search and pagination for Space and Apex lists.** Search + pagination. Space: rsvps, coupons, sponsors roster, leads, email, sessions, waitlist, hackathon teams, payouts. Apex: orphaned payments (content reports, request queues and support moved to D8) | done (#206), live 19 Oct |
| B7 | **Apex: one tabbed request inbox.** Apex: one tabbed request inbox replacing 7 queues | dropped: merged into D8 |
| B8 | **Apex web: add admin tools that are mobile-only today.** Apex web: OTA, default images, stats recipients, system health, seat-count reconcile (mobile-only or backend-only today) | done (#213), live 19 Oct |
| B9 | Subspace link requests from Space (`createSubSpaceRequest` unused) | dropped: merged into D5 |
| B10 | Discussion moderation (pin, lock, delete) in Space + Apex | dropped: discussions are dead code, removed in 0.9 |
| B11 | Support stats header (`GET /support/tickets/stats`) | dropped: merged into D8 |
| B12 | **Polish Space web from the visual audit.** From the 18 Oct visual audit of Space and Apex. | done (#239), live 19 Oct |
| B13 | **Add a simple editor for email campaigns.** Email compose is a raw 'Body (HTML)' textarea with merge tags (websites/space/app/(dashboard)/dashboard/email/new/page.tsx). | done, not deployed (#241) |
| B14 | **Label people vs bookings and revenue totals the same everywhere.** From the visual audit. | done (#232), live 19 Oct server side, mobile in 5.0.0 |
| B15 | **Add mobile-only desk actions to Space web.** D3 says desk work lives on web, but these curator desk tasks exist only on mobile. | done (#221), live 19 Oct |
| B16 | **Fix operator form saves and navigation traps.** Blank fields: edit forms can't clear optional fields because blanks are sent as undefined. | done (#209), live 19 Oct |
| B17 | **Validate event dates and copy setup into recurring occurrences.** - No date or timezone validation on event create and update (backend/src/events/events.service.ts:1424). | done (#218), live 19 Oct |
| B18 | **Make Huddle sessions findable, listed and joinable.** Huddle sessions dead-end. Quick ones first (high, confirmed). | done (#230), live 19 Oct server side, mobile in 5.0.0 |
| B19 | **Fix certificate and report correctness at scale.** Certificates. | done (#222), live 19 Oct |

### C · Notifications

| # | Item | Status |
|---|---|---|
| C1 | **In-app notification inbox.** (bell on Home), read/unread, backed by a delivery log | done |
| C2 | **Single notify orchestrator with channel fallback.** One `notify(user, event, data)` orchestrator: channel by preference + category, fallback push → WhatsApp → email by criticality (from W4) | done, not deployed (#258) |
| C3 | **Per-message delivery log with retries and dedup.** Delivery log per message (queued/sent/delivered/opened/failed, provider id), retries, dedup keys | done, not deployed (#248) |
| C4 | **Notification preferences grid and quiet hours.** Preferences: category × channel grid, quiet hours (IST), transactional vs marketing split | done, not deployed (#260) |
| C5 | **Provider delivery webhooks and email suppression.** Provider webhooks: SES bounces/complaints → suppress, WhatsApp status, OneSignal delivery | done, not deployed (#257) |
| C6 | Apex per-user message history + failure dashboard | done, not deployed (#257) |
| C7 | **Native: rich push images and action buttons.** Native (store build): iOS Notification Service Extension for images, push action buttons | parked (2026-10-18): native (Notification Service Extension) with no room before the 20 Nov freeze, and the next store window after 5.0.0 isn't planned. |
| C8 | **Add unsubscribe and consent to marketing sends.** Must land before the P track's curator emails and the P9 launch sends on 2 Dec. | done, not deployed (#250) |
| C9 | **Send event mail and confirmations to the right people.** Quick one first (high, live): paid-registration WhatsApp confirmations format times with toLocaleTimeString('en-US') and no timeZone, then append 'IST' (backend/src/registrations/registration-payments.service.ts:364-386, :1366-139 | done, not deployed (#246) |
| C10 | **Add filters and mark-all-read to the notification inbox.** Follow-up to C1 (merged #177), found on a real iPhone. | done, not deployed (#249) |
| C11 | **Check all-user push broadcasts reach people.** Apex Notifications shows both 'All users' app-update broadcasts (27 Sept) as '0 sent'. | done, not deployed (#249) |

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
| D1 | **Assist Case model.** Extend `support_tickets` (kind, desk, subject link, event/registration context, escalation, first response, read state per side, rating, AI fields, BOT status); `support_messages` `isStaffReply` → `side` + `internal` + `aiDrafted`. Migration + backfill | done (#147), live 19 Oct |
| D2 | **Access + routing + escalation.** One `canSeeCase`; new `event:manage-support` capability; routing rules; escalate to Platform (decision D2) | done (#147), live 19 Oct |
| D3 | **Notifications both directions + unread badges.** case created / replied / status / escalated → push + email to the other side; badges in mobile, Space, Apex (old D1 + D4) | done (#203), live 19 Oct (server; mobile rides 5.0.0). Apex sidebar badge waits for D8, Space desk badge for D9 |
| D4 | Attachments: private `SupportAttachment` via `StorageService`, signed URLs (old D2) | done (#147), live 19 Oct |
| | **Phase 2 · One system** | |
| D5 | **Request adapter.** All 10 request types open and update cases (SpaceRequest, SpaceStatus, SpaceOwnership, SubSpace incl. B9, WhiteLabel until H15, FreeAttendeeAdd, RegistrationTransfer → Platform; EventOwnershipTransfer, SubEventAttach → the other space) | done (#242) |
| D6 | **Refunds + cancellations inside Assist.** Curator stage = Space desk, admin stage = Platform desk; paid cancel = one flow that creates the refund; cancellation reason; S14 `cancelEvent` refunds run through it. After S51/S52 | done (#245) |
| D7 | **New: Event request.** Host an event without a Space: Platform approves, which creates a personal Space, curator role and a draft event | done (#244) |
| D8 | **Apex Assist inbox.** One inbox for every queue with typed action panels, stats header, search + pagination. Replaces Support, Requests, Refunds, report-issues and bank-account pages (B7, B11, part of B6) | done (#212), live 19 Oct: Support redirects; Requests, Refunds, reports and bank-account pages stay until D5, D6, D21 and D22 open cases for them |
| D9 | **Space Assist inbox (web)** with internal notes and escalation (old D5) | done (#216, event-only access #220), live 19 Oct: Space `/dashboard/assist` + desk unread badge, also for event-only operators |
| D10 | **Mobile: My Help + inboxes + Get help.** Requester timeline of every case; Space and Apex inboxes; "Get help" from event and ticket, pre-filled (old D3) | done (#231): mobile only, ships in the 5.0.0 store build |
| D11 | `unifesto.app/help` opens a case; guests find-or-create by email (old D8) | done (#261) |
| | **Phase 3 · AI layer (Claude Haiku 5.5)** | |
| D12 | **AI foundation.** `@anthropic-ai/sdk` `AiService`, `AiRun` cost log, kill switches, per-user caps, prompt caching, prompts under 100K, refusal → human, eval set, Console spend limit. Shared with Track M | done (#205), live 19 Oct; `ANTHROPIC_API_KEY` set in `backend/.env` and loaded. Eval set ships with each feature (D13 first). Left: Console spend limit |
| D13 | AI triage on every new case: category, priority, routing hint, language, sentiment, spam | done (#208, tune #211), live and on since 19 Oct (`triage` in `ai_enabled_features`): eval 21 cases: every field 20/21+ after one prompt tune (126 checks, 1 miss, a label since fixed), $0.002 a run; first prod runs ~$0.0003 a case |
| D14 | **Assist bot.** Self-serve answers from help articles, event FAQs and read-only account tools; proposes action cards the user confirms; hands off to a human with the chat as the thread | done (#259) |
| D15 | Desk copilot: draft reply, thread summary, policy facts computed by code | done (#255) |
| D16 | AI pre-screen of space and event requests for reviewers | parked (2026-10-18): space and event request volume is small and reviewed by hand quickly; |
| D17 | Help articles in Apex as the bot's knowledge base (from K7) | done (#214), live 19 Oct: `HelpArticle` + `/help` API, Apex `/dashboard/help`, web `/help`; event FAQs already in `EventFaq` |
| D18 | Nightly insights over closed cases (Batch API): themes and missing articles | parked (2026-10-18): nightly insights need case volume that only exists after D8, D9 and launch. |
| | **Phase 4 · Operations** | |
| D19 | Canned replies, SLA by priority, first-response and resolution metrics (old D6) | done (#254) |
| D20 | Auto-close resolved after 7 days + satisfaction rating (old D7) | done (#253) |
| | **Phase 5 · More case kinds** | |
| D21 | **Ticket issue reports become HELP cases.** `ContentReport` REGISTRATION ("Report an issue" on a ticket) goes to the event's Space desk; moderation keeps event/space reports | done (#229), live 19 Oct |
| D22 | Payout requests + bank account verification as Platform cases (with S23) | done (#281) |
| D23 | Stay + session cancellations and refunds through D6 (with S51) | done (#252) |
| D24 | Account deletion as a PRIVACY case with a timeline and cancel (I3) | done (#247) |
| D25 | **Grievance cases.** IT Rules 2021: acknowledge in 24 h, resolve in 15 days, public grievance page (I1) | done (#256) |
| D26 | WhatsApp inbox → "Convert to case", later a full channel | done (#282) |
| D27 | Hackathon help desk: "Escalate to organiser" opens a Space case | done (#282) |
| D28 | Space verification request (optional) | parked (2026-10-18): marked optional; verification is admin-set (Space.verifiedAt, live since #91) without a request flow. |
| D29 | **Clear the support and WhatsApp backlog.** Ops task, not code. Apex Support has 217 Open tickets ('Needs a reply'), 0 awaiting, 0 resolved, and the oldest refund requests are 12+ days old with 1 message. | in progress (#301) |


### E · Sponsors, partners, hackathon (from 4.3.0)

| # | Item | Status |
|---|---|---|
| E1 | **Shared collaborator invite flow.** Shared collaborator invite: email → find-or-create → invite → claim on first login | done (#422) |
| E2 | **Space web partner portal.** Space web `/partner` portal modelled on `/sponsor`; landing routes sponsor/partner-only users to their portal | dropped (covered by X7 Tracking) (#414) |
| E3 | Sponsor portal: lead notes + status, per-event booth stats | done (#423) |
| E4 | Partner: multiple links, share kit (tracked link + QR) | done (#414) |
| E5 | **Finish hackathon submissions: curator overview, lock after judging.** Hackathon submissions (title, repo, demo, deck) with per-round deadline; judges see them while scoring | done (#412) |
| E6 | Hackathon certificates from awards | done |
| E7 | **Add an offline queue to BoothScan.** Offline queue for BoothScan + StayScan, reusing `src/lib/offline/checkinQueue.ts` | done (#413) |
| E8 | **Fix hackathon judging integrity and score privacy.** Privacy first (small, confirmed): the retired public-leaderboard 'subscribe' socket leaks every team's live score and rank to any registered attendee (backend/src/leaderboard/leaderboard.gateway.ts:131, an S36 regression). | done (#366) |
| E9 | **Add consent and anti-abuse to lead capture and fix notify-me.** - Public lead capture is unauthenticated and unthrottled, accepts private or suspended spaces and draft events, and lets anyone overwrite an existing lead by email (backend/src/sponsors/leads.service.ts:30, :76, public-leads.contr | done (#407) |

### F · Feedback and user IAM (from 4.4.0)

| # | Item | Status |
|---|---|---|
| F1 | **Per-event attendee feedback form.** Event feedback: per-event form (rating 1–5, NPS, organiser questions using registration question types), one response per attendee | done (#417) |
| F2 | **Feedback request timing and reminders.** Trigger to checked-in attendees 2 h after end, reminder at 48 h, closes at 7 days; optional "feedback unlocks certificate" | done (#427) |
| F3 | **Feedback results and public rating.** Results in Space web + mobile (averages, NPS, distribution, comments, CSV); opt-in public rating at N ≥ 5 | done (#428) |
| F4 | **User IAM: suspend, ban and force logout.** User IAM: suspend/ban with reason + expiry, force logout (revoke refresh tokens), per-user capability overrides | done (#411) |
| F5 | **Audit trail for admin changes in Apex.** Audit trail for permission, role, status, plan and reconcile changes, shown on Apex entity detail | done (#418) |
| F6 | Apex user detail: their registrations and payments | planned |
| F7 | **Write the 5.0.0 What's new and show it as a sheet.** In-app "What's new" sheet after an OTA applies | done (#290) |
| F8 | **Make co-hosting a request the other space accepts.** addCoHost (backend/src/events/events.service.ts:910-935) attaches any space as co-host immediately, with no consent. | done (#405) |

### G · Mobile scope, design and performance

| # | Item | Status |
|---|---|---|
| G1 | **Open-on-web handoffs for desk work on mobile.** "Open on web" handoffs (deep link) for desk work on mobile: event/ticket/coupon/question editors, series dates, sub-events, co-hosting, content editors, stay editors, CSV import, hackathon setup (settings, themes, statements, rounds, criteria, panels, judges, awards, certificates), white-label, billing, payout accounts; Apex blog, careers, categories, email compose/templates, plans, subscriptions, IAM, reconciliation, logs, default images | done (#378) |
| G2 | **Make on-site mobile tools survive offline and slow networks.** Keep on mobile and polish: check-in (online + offline), scanners, attendee actions, waitlist offers, hackathon queues/rooms/announce/help-desk, judging, leads, refund approve, support, WhatsApp inbox, request review, status, OTA | done (#273) |
| G3 | **Cosmos migration of the remaining mobile screens.** Cosmos migration in order: manage-event subtree → check-in → attendee leftovers (registration success, claim, group, refund, sessions, live session, stays, edit details) → hackathon/judging → Apex. About 115 screens | done (#385) |
| G4 | **Move long mobile lists to FlatList.** Long lists → `FlatList`: Waitlist, ManualCheckin results, HackathonTeams, Queues, Results, Leads, Coupons, `sessions.tsx`, `group/[registrationId]` | done (#278) |
| G5 | **Space web: PageHeader and EmptyState rollout.** Space web page pattern: Stays pages on `PageHeader`/`EmptyState`; `EmptyState` on attendees, checkin, transactions, tracking, IAM, settings | done (#286) |
| G6 | **Remaining on-site web-to-mobile parity.** Remaining web → mobile parity, on-site parts only: certificates issue, reports view, sessions list | dropped (2026-10-18): merged into G8 (both cover on-site web-to-mobile parity, x-parity-16); |
| G7 | Unicon: redraw glyphs in our own style, tab bar + Home first | parked (2026-10-18): redrawing Unicon glyphs in a house style is design polish with no user value before 5.0.0; |
| G8 | **Organiser event-day mode on mobile.** Organiser "event day" mode on mobile: one cockpit with live check-in count, today's revenue, announce, help-desk queue | done (#387) |
| G9 | **Unify the mobile API client: refresh, errors and deep links.** - A silent refresh that fails with 5xx or 429 signs the user out (mobile/src/lib/api/helpers.ts:129, :190); | done (#263) |
| G10 | **Fix check-in for group members, undo and offline sync.** Groups: bulk check-in (a B2 regression) and Space web scan check in whole groups at registration level (backend/src/checkin/checkin.service.ts:1036, :1180, team-changes.service.ts:263), and a member's pass shows 'You are checked i | done (#268) |
| G11 | **Add ended-event states to tickets, hubs and Space.** Visual audit. | done (#276) |
| G12 | **Fix mobile attendee and organiser screens.** Quick ones first. | done (#265) |
| G13 | **Polish mobile from the 18 Oct device audit.** Low and medium items from the real-iPhone pass. | done (#274) |
| G14 | **Fix accessibility: labels, Dynamic Type and contrast.** Mobile: 179 FieldRow inputs and AuthField have no accessible label (mobile/src/components/manage/FormFields.tsx:48); | done (#404) |

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
| H1 | **P1 white-label theme migration.** P1 migration `20261014120000_white_label_theme`: `brandFont`, `brandMode`, `hidePoweredBy`, `brandingSuspendedAt` (`brandLogoUrl` revived) | done, live 14 Oct |
| H2 | **P1 branding resolvers and self-serve white-label API.** P1 `branding.util` resolvers (on && plan && !suspended; payload adds name/logo/font/mode/hidePoweredBy, 5-test spec); `/white-label` routes self-serve via `@Can`; logo/favicon upload; admin suspend; private brand fields stripped from public space payloads | done, live 14 Oct |
| H3 | **P1 web: branded chrome on space and event pages.** P1 web: `components/BrandedChrome.tsx` replaces Navbar/Footer on space + event pages when the space theme is live; Google font + forced light/dark | done, not visually verified |
| H4 | **P1 Space Branding studio and mobile brand logo.** P1 Space Branding studio (all fields + uploads + live preview + event colours + upsell); Apex Manage page Suspend/Restore; mobile manage card self-serve copy; mobile space + event screens show the brand logo as the header title and light the sky with the brand colour | done, mobile not visually verified |
| H5 | **P2 branded email layout for attendee emails.** P2 branded email layout (logo/name header, accent buttons, "Sent by X via Unifesto") on all 12 attendee templates; `EmailService.brandFor(eventId)` resolves theme + sender centrally | done, live 14 Oct (#106) |
| H6 | **P2 custom sending domains per space.** P2 `SpaceDomain` (migration `20261014140000_space_domains`) + Resend Domains add/verify/remove + studio card; mail sends from `<local>@<verified domain>` | done, live 14 Oct (#106) |
| H7 | **P3 custom web domains per space.** P3 custom web domains: Cloudflare custom hostnames add/verify/remove, public `GET /white-label/domains/resolve`, Caddy catch-all, web middleware tenant routing (+ `scripts/middleware.check.mts`), per-host canonical/OG, emails link to the custom domain | done, live 14 Oct (#106) |
| H8 | **Needs you: Cloudflare for SaaS and Resend setup.** enable SSL for SaaS on the zone, create fallback origin `domains.unifesto.app`, API token → `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN`; check the Resend plan's domain limit | done 2026-10-15 (events.wegobeyond.in live end to end) |
| H9 | Bring-your-own WhatsApp sender per space (today it's one env number) | parked (2026-10-18): per-space Meta WhatsApp sender onboarding is heavy and the WhatsApp cost trim keeps WA minimal; |
| H10 | **Deploy #106 white-label release.** Deploy #106: read migrations `20261014120000_white_label_theme` + `20261014140000_space_domains`, `migrate deploy`, rebuild backend + web + space + apex, Caddy reload, mobile OTA (manage-card copy) | done: shipped in the 14 Oct full deploy (83d24f0), checked 16 Oct; mobile copy rides the 5.0.0 store build |
| H11 | **Verify white-label rendering after deploy.** Verify after deploy: branded space + event page (header/footer, font, forced mode), Branding studio uploads + preview, a branded registration email in Gmail + Apple Mail (light/dark), suspend/restore from Apex. None of this was seen rendered | done 16 Oct: checked on Beyond (pages, studio save + uploads, branded emails, Apex suspend/restore), all reverted; email dark mode checked in code only |
| H12 | **Mobile: use the space font on space and event screens.** Mobile: `branding.font` on space + event screens (logo shipped with H4) | done (#146), live 19 Oct server side, mobile in 5.0.0; not seen on device |
| H13 | **Use the custom domain in calendar and share links.** Web "Add to calendar" (`lib/calendar.ts`) and share links use the space's custom domain when it has one | done, live 16 Oct (#135) |
| H14 | **Send certificate emails from the space's address.** Certificate emails go via SES, so they can't use a space's custom sending address (name + reply-to only). Verify the domain in SES too, or move certificate mail to Resend | done (#280) |
| H15 | **Retire legacy white-label requests in mobile, Apex and backend.** Retire the legacy request flow once no shipped mobile build calls it: `POST /white-label/requests`, Apex White-label History, mobile request copy, then drop `white_label_requests` | blocked: Apex half done, route + table drop wait for O6 (5.0.0 minimum) (#408) |
| H16 | **Space app: gate Branding on manage-settings capability.** Space app `Capability` type has no `space:manage-settings`, so the Branding nav item gates on `manage-billing` (backend enforces manage-settings). Add the capability to the space RBAC types | done, live 16 Oct (#135) |
| H17 | **Serve font presets from the overview endpoint.** Font presets are duplicated in `backend/src/white-label/branding.util.ts` and `websites/space/lib/api/white-label-api.ts`; serve them from the overview endpoint instead | done, live 16 Oct (#135) |
| H18 | **Custom-host lookup cache delays suspension by up to 60s.** Custom-host lookup is cached 60s per web process, so a suspension or removal takes up to a minute to take effect. Fine for now; shorten or invalidate if that matters | parked |
| H19 | **Canonical URLs point to the space's custom domain.** Event + space pages of a space with a live custom domain set canonical and og:url to it, also on www (no redirect, old links keep working) | done, live 16 Oct (#135) |
| H20 | **Upgrade Resend plan before selling custom sending domains.** Free allows 1 domain and `notify.unifesto.app` uses it, so the first space to verify its own sending domain is refused | in progress (#391) |
| H21 | **Apex white-label form loads the target's live branding.** It showed #3491ff for every space, so Apply could overwrite a real colour | done, live 16 Oct (#140) |
| H22 | **Square space logo is too small in the branded header and email.** Size up the square fallback or show the name beside it | done (#146), live 19 Oct |
| H23 | **Branded emails still mention the Unifesto app.** Keep, reword or drop "Your ticket is also in the Unifesto app" when the space theme is live | done (#288) |
| H24 | **Email calendar attachment links to the custom domain.** `buildIcsAttachment` runs before `brandFor()`; pass the brand's `customDomain` into `IcsEventInput` | done (#146), live 19 Oct |
| H25 | **Fix white-label custom-domain forms, sender names and takeover.** Quick one first (high, live since #106): the CORS allowlist accepts only *.unifesto.app and localhost (backend/src/common/cors.ts:13-18, main.ts:73-89). | done (#269) |

### I · Legal (from W6)

Drafts need a human lawyer's sign-off before publishing.

| # | Item | Status |
|---|---|---|
| I1 | **Legal documents: terms, privacy, refund and other policies.** Terms (attendees), Organiser/Space Agreement, Privacy Policy (DPDP 2023), Refund & Cancellation, Acceptable Use, Sponsor & Partner terms, Cookie Policy, Grievance page (IT Rules 2021) | planned |
| I2 | **Versioned legal docs with per-user acceptance.** Versioned legal documents with acceptance per user; re-acceptance on next launch on every client | done (#285) |
| I3 | DPDP erasure on account close (#41): needs backend rebuild | done; follow-up I5 |
| I4 | **Privacy Policy retention line for erased answers.** Privacy Policy retention line for erased question answers, once I1 + I3 land | planned |
| I5 | **Finish DPDP erasure and set retention limits.** Quick fix first: account deletion never completes for anyone whose bank account received a payout (FK RESTRICT on bank accounts), and the failure is never reported (backend/src/users/users.service.ts:1020). | done (#283) |

### J · Scale and reliability (from W1/W2)

This was cut down from the v4 EKS plan. Do the cheap wins first, and only move to EKS when traffic needs it.

| # | Item | Status |
|---|---|---|
| J1 | **Endpoint guard audit, input validation and rate limits.** Endpoint guard audit (all routes vs `@Can`/guards), input validation, per-route rate limits | planned |
| J2 | **Fix boot failures, stranded push campaigns and cron gaps.** Silent catches, cron jobs safe with multiple replicas (single-runner locks), graceful shutdown | done (#339) |
| J3 | **Cap public list queries and fix hot-path N+1s.** Missing indexes, N+1s, unbounded `findMany` | done (#380) |
| J4 | **Turn on Sentry and JSON logs, keep 180-day logs.** Structured logs + request ids + error alerting; deeper `/health` | in progress (#371) |
| J5 | **Queue publish emails, bulk import and blasts.** Queue heavy work (email, push fan-out, PDF/cert rendering) off the request path | done (#386) |
| J6 | **Drill a backup restore on a staging copy, then run k6.** k6 scripts for real peaks (event page, OTP login, checkout, check-in, leaderboard); baseline on a staging copy | planned |
| J7 | **Autoscaling on EKS with managed infra and CI/CD.** Autoscaling (EKS + ALB, Terraform + Helm, Secrets Manager, PgBouncer, Redis, CI/CD replacing `deploy.sh`) | parked: only when J6 shows the current host can't take the peak |
| J8 | **Cap group size on every registration path.** Critical. groupSize has only @IsInt @Min(1) (backend/src/registrations/dto/index.ts:100-105, :247-252). | IN_REVIEW (#308) |
| J9 | **Keep private event and session fields out of public APIs.** - Anonymous GET /events, GET /events/space/:id and favourites return every Event column through include with no select (backend/src/events/events.service.ts:1554-1593, getSpaceEvents ~:2675), exposing whatsappAttendeeGroupUrl, onl | IN_REVIEW (#311) |
| J10 | **Close cross-tenant writes on ticket types and space hierarchy.** 1. IDOR: deleteTicketType never checks that tt.eventId equals the authorised event (backend/src/events/events.service.ts:3056-3086; | IN_REVIEW (#313) |
| J11 | **Fix stored XSS in email preview and SSRF in certificate render.** 1. XSS: the Space email preview iframe uses srcDoc with no sandbox (websites/space/app/(dashboard)/dashboard/email/new/page.tsx:449-453), so template HTML runs in the Space origin. | IN_REVIEW (#310) |
| J12 | **Make Redis and config caches replica-safe.** 1. The shared RedisService retryStrategy returns null after 3 tries (backend/src/redis/redis.service.ts:41-55), so the ioredis client ends for good, and a failed boot ping sets client=null (:106-108). | done (#316) |
| J13 | **Deploy only CI-green main with a rollback image.** deploy.sh:87-110 rsyncs the local working tree with no check on git status, branch, origin/main or CI, and parallel sessions share this tree. | done (#292) |
| J14 | **Move production secrets off the dev laptop.** backend/.env and backend/.env.local are identical, set NODE_ENV=production and point at the prod RDS. | in progress (#317) |
| J15 | **Move personal files and recordings to private storage.** - Event report PDFs (full roster with emails and revenue) are uploaded to the public bucket at non-expiring URLs and survive 'delete' (backend/src/reports/reports.service.ts:236), contradicting the Privacy Policy. | planned |
| J16 | **Enforce space status and event visibility everywhere.** Setting a space to SUSPENDED, ARCHIVED, REJECTED or INACTIVE only updates the status column (backend/src/admin/admin.service.ts:830-846, spaces.service.ts:513-575). | done (#332) |
| J17 | **Harden auth and operator sessions.** Identifiers: emails are never normalised, so case variants create separate identities and bypass per-identifier OTP limits (backend/src/auth/auth.service.ts:192); | done (#367) |
| J18 | **Make the schema rebuildable and harden the production host.** - Migration history can't rebuild the schema. | planned |
| J19 | **Add CI gates: builds, lint, dependency scan and tests.** - All three Next apps ship with typescript.ignoreBuildErrors although they now typecheck clean (websites/web/next.config.ts:31, websites/space/next.config.ts:17), and the web proxy self-check script is broken. | in progress (#357) |

### K · Growth and discovery

| # | Item | Status |
|---|---|---|
| K1 | **Discovery marketplace on web and mobile.** Discovery marketplace on web + mobile: browse by city/college/category, "trending near you" | done (#425) (#425) |
| K2 | **Fix SEO gaps: crawlable cards, event JSON-LD, full sitemap.** SEO: sitemap (events, spaces, blog, careers), JSON-LD (Event, Article, JobPosting), RSS, canonicals (from W7) | planned |
| K3 | **Harden the blog and careers editors: draft guard, scheduling, slugs.** Blog: authors, tags, scheduled publish, OG image, reading time, related posts | planned |
| K4 | **Careers: application form and applicant pipeline.** Careers: application form with private resume upload + applicant pipeline in Apex | done |
| K5 | **Tracked short links with QR and click country.** Tracked short links on the apex domain + QR; country in click tracking (from W10) | in progress |
| K6 | **Count web visits and referrers by domain.** Web referrer capture rolled up by domain; Search Console backlink import, weekly | done (#322) |
| K7 | **Legal pages managed in Apex.** Help articles moved to D17 (Assist knowledge base) | done (#416) (#416) |
| K8 | **Show past and live events in public lists.** getEvents hard-filters status PUBLISHED (backend/src/events/events.service.ts:1481-1488), and GET /events/space/:id does the same for outsiders. | done, not deployed (#243) |
| K9 | **Fix the public event page and remove fake web pages.** 1. On phones /event/[slug] renders 499px wide in a 375px viewport and is clipped (title, venue and Directions cut off) on the main conversion page. | done (#251) |
| K10 | **Let attendees register and pay on the web.** Registration is app-only: websites/web/src/app/event/[slug]/register/page.tsx redirects ('Registration is mobile-only') and the CTA is an intent:// deep link, so desktop visitors go to /download. | in progress (#349) |
| K11 | **Polish the public web from the visual audit.** Low items from the visual audit. | done (#424) (#424) |

### L · Live engagement (new)

The biggest product gap versus KonfHub. It keeps attendees in the app *during* the event.

| # | Item | Status |
|---|---|---|
| L1 | **Live polls during events.** Live polls (organiser launches from mobile event-day mode, attendees vote on ticket screen) | done (#271) |
| L2 | Q&A with upvotes + moderation, per session/track | done (#277) |
| L3 | Quizzes with a live leaderboard (reuse hackathon leaderboard sockets) | done (#279) |
| L4 | Projector view on web (results, Q&A wall) | done (#287) |

### M · AI assists (new)

| # | Item | Status |
|---|---|---|
| M1 | **AI: draft event content from a few lines or a link.** Draft event description, agenda and FAQs from a few lines or an imported link | done (#266) |
| M2 | Email/WhatsApp copy suggestions in campaigns | parked (2026-10-18): low value; revisit after D12 (AI foundation) and C8 (unsubscribe and consent) land. |
| M3 | Post-event report summary (attendance, revenue, feedback themes) | done (#264) |
| M4 | **Who to nudge: past attendees likely to register.** "Who to nudge": past attendees likely to register, for a curator-approved campaign | parked (2026-10-18): nudging past attendees needs consent and unsubscribe (C8, I2) first, or it is a DPDP and spam risk. |

### N · On-site (new)

| # | Item | Status |
|---|---|---|
| N1 | Badge/pass printing (PDF sheets + label printers) from the roster | done (#272) |
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
| P23 | **Keep the demo Space out of metrics and mask payout details.** 1. The demo Space's Event Settings payout dropdown shows a real SBI account holder's name and a team member's full UPI ID. | done (#318) |

### T · Deals, billing and access (2026-10-16)

From the IAM / plan / billing / fee analysis on 2026-10-16. Clients get different deals (custom fee %, organiser absorbs the fee, free or comp plans, one-off event deals), so commercial terms move out of code and plan rows into a versioned **Deal** (D8). The plan rate card is the default deal. Fees are stored as basis points (250 = 2.5%) and money as paise integers.

Terms resolve in this order: **active event deal → active space deal → rate card of the space's plan**. One `quote()` turns base price + terms into `{ buyerFee, organiserFee, total }`, and every paid row stores the result.

| # | Item | Status |
|---|---|---|
| T1 | **Close Co-Curator escalation to money.** `publishEvent`/`cancelEvent` check `EVENT_EDIT` only (Co-Curator can publish/cancel). `addTeamMember`/`removeTeamMember` check `EVENT_EDIT` and accept CURATOR, so a Co-Curator can make themselves Curator (gets `EVENT_MANAGE_MONEY`) or remove the Curator. Require `EVENT_PUBLISH`/`EVENT_CANCEL`/`EVENT_ASSIGN_CREW` | IN_REVIEW (#309) |
| T2 | **Enforce one role-assignment rule and drop hand-rolled checks.** `canAssign(actor, role)`: only grant roles below your own; CURATOR only by Space Admin or ADMIN; never your own role. Replace ~10 hand-rolled role checks (`event-access.ts`, sessions, check-in, help desk, `spaces.service.ts` `SPACE_ADMIN_TIER`, transfers) with `assertCan` so platform ADMIN inherits. Drop CURATOR's space-scope grants (`space:manage-email/sponsors` 403 today). Revoking a role's last grant leaves it empty (no compiled fallback). Policy comment matches D9 | planned |
| T3 | **Serve one access endpoint and share the IAM cache.** `GET /spaces/:id/access` returns effective capabilities + plan features for any member. Space app drops the hard-coded `rbac.ts` map and the `/usage` features call (non-billing members see every gated nav item today). Capability + plan caches carry a Redis version stamp so edits reach every replica | done (#342) |
| T4 | **Add the Deal model and term resolution.** `Deal` (spaceId, optional eventId, plan, planPricePaise: null = rate card / 0 = comp, billingCycle, buyerFeeBps, organiserFeeBps, validFrom, validUntil, note, createdBy). Rate card = `buyerFeeBps`/`organiserFeeBps` on `PlanConfig` (replaces dead `processingFeePercent`). `TermsService.resolve(spaceId, eventId, at)`. Backfill: every space gets terms equal to today's behaviour (5% buyer, its revenue share as organiser fee), so nothing changes until a deal is edited. `REVENUE_SHARE` billing model becomes `organiserFeeBps` | done (#348) |
| T5 | **Quote every checkout path from one function.** `quote(basePaise, terms)` in integer paise, used by main checkout, legacy register, manual-add link, waitlist, group seat add-on, sessions, stays. `POST /quote` for web and mobile (mobile stops computing `base × 1.05`). Each paid row stores `dealId`, `buyerFeePaise`, `organiserFeeBps`. Old 4.0.5 app still shows a 5% estimate (Razorpay charges the right amount): Apex warns when a deal's buyer fee is not 5% until 2 Dec. `quote()` takes an optional coupon so every buyer-paid path can accept one; turn it on for waitlist claims and sessions (main checkout only today) | done (#348) |
| T6 | **Settle money from per-row snapshots, sessions included.** One `settle(rows)` feeds payouts, financials, Space Transactions page and CSV export, using each row's stored terms (deal changes never rewrite the past). `Payout` gets `sessionId` (exactly one of event/session) so Huddle revenue can be paid out. Forced reconcile books what was actually captured: short lowers `totalAmount`; over goes to the organiser's base, not to our fee (today the platform keeps it). Event and space dashboard revenue (`events.service.ts:3221`, `spaces.service.ts:2340`: PAID only, refunds ignored) reads `settle()` too. Drop the per-payout `platformFeePercent` override (`payouts/dto`): the deal is the only rate | done (#389) |
| T7 | **Build the Apex Deals page.** Per space: current terms, deal history, new version (space or one event), live quote preview, required end date on comp plans. Every change goes to the audit trail (F5) | planned |
| T8 | **Fix the subscription lifecycle.** Status from dates, not `isActive`: ACTIVE → GRACE (7 days) → EXPIRED (STARTER entitlements, data kept). Period end = max(now, current end) + cycle (fixes calendar-boundary expiry). Cancel at period end. Razorpay `order.paid` webhook activates (receipt ≤ 40 chars). Price from the deal. Apex records offline payments (bank transfer). MRR from payments, not typed amounts. Plan changes: upgrade now, pay the difference for the rest of the period; downgrade at period end (no refund). Expiry, renewal and every plan change run in one transaction with a `SubscriptionHistory` row (expiry writes none today). Includes A1 checkout UI | done (#365) |
| T9 | **Enforce every plan limit with one entitlement check.** `assertFeature`/`assertLimit` read `TermsService` plan + subscription status. Missing subscription row is created as STARTER (no fail-open/closed/500 mix). Enforce attendees per event, co-curators, spaces, waitlist, WhatsApp blast, recurring events | done (#397) |
| T10 | **Remove dead pricing config.** Drop `platform_config.processing_fee_percent`, `razorpaySubId` and stale Apex subscription API fns. `PlanConfig.processingFeePercent` stays as A9's `platformFeePercent` (D10), with its Apex/mobile edit screens. `/pricing` reading `/subscription/plans` lands with A9 | done (#381) |
| T11 | **Store tax and gateway fees on each sale.** `gstPaise` + place of supply on the snapshot, GSTIN on the space; 0 until the CA check. Store `gatewayFeePaise` + `gatewayTaxPaise` from reconcile (Razorpay's ~2% + GST comes out of our fee) so A5/A7 report true take rate. Invoices and GSTR export stay in A6 | planned |
| T12 | **Finish the IAM hardening leftovers.** `RolesGuard` passes on a role held anywhere: check scope or retire it for `@Can`. `UserRole` unique allows duplicates (NULL space/event ids): make it `NULLS NOT DISTINCT` after a dedupe. Space-member DTOs accept `ADMIN`: restrict to space roles. Money routes in `payouts.controller.ts`/`refunds.controller.ts` get `@Can` on top of the service checks. Delete the stale "compiled shims" comment in `capability-config.service.ts` | planned |

### U · Company (Unifesto Pvt Ltd) (2026-10-20)

Run the company from Apex, next to the Product board but not a copy of it: compliance obligations with due dates, company documents and company KPIs for Unifesto Private Limited. Adds a platform-level **Employee** role for the team. Item details, names, amounts and targets live in the private company plan doc and in the app, never in this public repo. Ships as one PR per phase: U1–U3, U4–U6, U7–U9.

Decisions (20 Oct): one `EMPLOYEE` role; finance, bank and shareholding items sit behind a separate `company:view-restricted` capability, off by default and toggled in the IAM console. ADMIN stays superuser. Documents upload in v1 (private S3). Simple recurrence in v1. The `unifesto-pm` MCP gets company tools (ADMIN tokens only).

| # | Item | Status |
|---|---|---|
| U1 | **Add the Employee role and company/product capabilities.** `RoleCode.EMPLOYEE` (PLATFORM scope) + `roles` row + seeded `role_capabilities`. New PLATFORM actions: `company:view`, `company:edit`, `company:manage`, `company:view-restricted`, `product:view`, `product:edit`. EMPLOYEE default: company view/edit + product view/edit. Editable row in `ROLE_CATALOGUE`, but `platform:manage` (guards the IAM console itself) and `company:manage` can never be granted to EMPLOYEE, so an employee can't escalate. Specs: lock holds, restricted needs the capability, ADMIN inherits all | done (#302) |
| U2 | **Assign employees and give them a restricted Apex.** `PUT /admin/users/:id/employee {enabled}` (ADMIN only; findFirst before create because of the T12 NULL-unique duplicates) + "Make employee" toggle on Apex Users/[id]. `GET /users/me/access` also returns the caller's platform capabilities. Apex: new `employee` app role in `resolveAppRole`, AppShell lets it in, `nav-config.ts` items carry a capability and are filtered, a disallowed page shows no-access. Space app `resolveLanding` sends employees to Apex | done (#302) |
| U3 | **Open the Product board to employees.** `pm.controller.ts` REST routes swap `@Roles(ADMIN)` for `@Can(product:view)` / `@Can(product:edit)`. MCP tokens stay ADMIN-only | done (#302) |
| U4 | **Add company obligations.** `CompanyItem` (key "C1", title, category ROC/TAX/GST/IP/GOVERNANCE/PEOPLE/FINANCE/FUNDING, status TODO/IN_PROGRESS/WAITING/FILED/DONE/NA, dueDate, ownerId → User, restricted, filedOn, reference (SRN/ack no), notes) + append-only `CompanyActivity`. `company/` module: overview, list, upsert, note. Restricted rows filtered server-side without `company:view-restricted`; `company:edit` changes status/notes on items you own; `company:manage` creates and assigns | planned |
| U5 | **Repeat recurring obligations.** `recurrence` NONE/MONTHLY/QUARTERLY/ANNUAL on `CompanyItem`; marking one DONE creates the next with the due date moved on. No cron | planned |
| U6 | **Build Apex Company Overview and Obligations.** New "Company" nav group. Overview: overdue, due in 30/90 days, my items. Obligations: list by due month with category/status/owner filters, detail with activity | planned |
| U7 | **Add the company documents register.** `CompanyDocument` (title, category, restricted, optional item link, uploadedBy). Files via `StorageService.uploadPrivate` under `private/company/<docId>/`, opened with 5-minute `signedGetUrl`. **Before deploy: verify the S3 bucket policy blocks public GetObject on `private/*`** (still unchecked) | planned |
| U8 | **Show company KPIs on Overview.** GMV and own revenue from `/payouts/admin/financials` against targets an ADMIN sets in the app (not in code). Restricted (`company:view-restricted`) | planned |
| U9 | **Give the `unifesto-pm` MCP company tools and load the items.** `list_company_items`, `upsert_company_item`, `add_company_note`. Then load the obligations from the company plan doc (ITR-6, board meeting, share certificates + registers, share transfer + director change, AGM, AOC-4, MGT-7A, GST, trademark, TDS check, DIR-3 KYC, team letters + IP/NDA, Zoho Books (D4), Seed Fund, founder loan settlement), with the ones already done marked DONE. Restricted items flagged on load | planned |

### V · Space into Web (2026-10-29)

Move the operator console (`websites/space`, space.unifesto.app) into `websites/web` at **`www.unifesto.app/console/*`**. Apex stays its own app at apex.unifesto.app. One container, one build and one Sentry project instead of two, and it opens the way to one UI kit and one sign-in for public and console later (not in this track). Ships as four PRs, each based on main and safe on its own: V1, V2, V3, V4.

Decisions (29 Oct): the canonical host stays `www.unifesto.app`. Public and console get **separate root layouts** (`app/(public)/` and `app/(console)/console/**`), so their CSS never mixes and crossing between them is a full page load. Console URLs drop `/dashboard`: `/dashboard/x` → `/console/x`, `/login` → `/console/login`, and the same for `/no-access`, `/sponsor` and `/present/*`. `space.unifesto.app` keeps a 308 redirect forever, because shipped 4.0.5 builds and old emails link there. Organisers stay signed in: the console reads the `.unifesto.app` `unifesto_token` cookie first.

| # | Item | Status |
|---|---|---|
| V1 | **Split web into a `(public)` route group (no visible change).** Move every route and web's root layout under `src/app/(public)/`; `robots.ts`, `sitemap.ts`, `llms.txt` and `global-error.tsx` stay at the app root. Unmatched URLs 404 through `(public)/[...missing]/page.tsx` calling `notFound()` (`global-not-found` is still experimental in Next 16). Done when build and `npm test` pass and every sitemap URL plus a known 404 return the same status as prod | planned |
| V2 | **Move the console to `/console`.** `git mv` space `app/**` → `src/app/(console)/console/**` (its layout becomes the `(console)` root layout, `globals.css` → `console.css`, `noindex`) and `components`/`lib` → `src/console/*`. Rewrite 1,171 `@/components`/`@/lib` imports to `@/console/*` (avoids the `ui/button`, `ui/badge` and `lib/api/orbit.ts` clashes) and ~120 route strings (`nav-config.tsx` feeds the sidebar and ⌘K). Drop space's `/` landing gate (AppShell and login already resolve landing). Add livekit ×3, radix ×5, axios, react-easy-crop, recharts and socket.io-client. One `proxy.ts`: custom domains first (a tenant host never reaches `/console`; test it), then on `/console/**` the session gate, the login rate limit and a console CSP whose `connect-src` adds LiveKit, socket wss, Google Maps, S3 uploads and Razorpay. `next.config` headers for `/console/**`: `camera=(self), microphone=(self)` (check-in scanner, live sessions) and `same-origin-allow-popups` on console Razorpay pages. `robots.ts` disallows `/console`. Sentry: web project plus a `surface` tag. Web build args and the server's `websites/web/.env.local` gain `NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Caddy: www's `reverse_proxy web:3000` gets `header_up X-Forwarded-For {client_ip}`, or the login limiter keys on Cloudflare's IP. Space builds with `--webpack`: try Turbopack first, fall back if it breaks. No `websites/space` edits from other sessions while this PR is open. Deploy `./deploy.sh web`: console live at www, space.unifesto.app untouched on its last image | planned |
| V3 | **Cut space.unifesto.app over to www.** Caddy: `/dashboard/*` → `/console/*`, everything else → `/console{uri}`, 308, query kept (the `?space=` switch). Point links at `/console`: `backend/src/email/layout.ts` `SPACE_APP` (8 links; also fixes `/dashboard/bank-account`, which 404s today: use `financials?tab=accounts`), the `renewUrl` in `admin.service.ts` and `subscription-scheduler.service.ts`, Apex `NEXT_PUBLIC_SPACE_URL` and the `rbac.ts` default, web `site.ts` `spaceApp`, `cors.spec`. Mobile `openOnWeb.ts` (10 calls) reaches users only with a store build: in 5.0.0 if V2 is live by the 20 Nov freeze, else 5.1; the redirect covers old builds. Rollback = revert the Caddy block (the old container still runs) | planned |
| V4 | **Remove the space app after a clean week.** Drop the `space` service from `docker-compose.yml` (384 MB limit; raise web's 768 MB by what it measures), the `deploy.sh` service list and `websites/space/.env` check, the CI space job, the `unifesto-space` entry in `.claude/launch.json`, the Sentry space project, the README and this file's "four websites" line. Keep the `space` DNS record: the redirect needs it | planned |

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
- **2026-10-19** · B19 (#222): certificates: a single revoke is now for cause and survives re-runs and "Reissue all" (`revoked_for_cause`); deleting a template with issued certificates retires it (`deleted_at`) so verify links keep working; CHECKED_IN certifies only the group members actually scanned, each filed under their own account; serials come from one MAX query plus a per-batch counter (was O(n²)); stale batches closed every 30 min; Indian-script names switch to Noto Sans faces (the 18 TTFs landed in #226). Reports: a bare 'To' date covers that whole IST day; renders go to cert-worker, one at a time per event. Migration 20261028100000. Backend jest 972/972. Deploy: migrate + rebuild backend (+ cert-worker) + space.
- **2026-10-19** · Deployed main 6d86ffa (backend, web, space, apex, cert-worker): prod schema up to date at 166 migrations, backend source matches main, all four sites 200. Live server-side: A9, A13–A16, A27, A31, A33, A34, B4–B8, B15–B17, B19, D1–D4, D8, D9 (+#220), D12, D13, D17, H22, H24. Mobile parts (O1–O16, H12, mobile bits of A31/D3) still ride 5.0.0. AI stays dark until `ANTHROPIC_API_KEY` is in the server env and `ai_enabled_features` lists `triage`.
- **2026-10-19** · D13 triage switched on in prod (`ai_enabled_features = ['triage']`). First runs: test case #226 flagged spam/low as expected; #227 (certificate not received) triaged EVENTS/NORMAL with routing hint SPACE, but it sits on the Platform desk with no event, so a "Send to organiser" action for Apex is being built.
- **2026-10-19** · B19 fonts (#226): Noto Sans Regular/Bold for Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada and Malayalam bundled in `backend/assets/certificate-fonts` (OFL, notofonts.github.io, ~2.6 MB); PDF and PNG renders checked by eye. Deploy: rebuild backend + cert-worker.
- **2026-10-19** · Track D: Send to organiser (PR #227). Platform can hand a HELP case to an event's organiser: `POST /support/tickets/:id/send-to-space` with `eventId` (platform admins only; not for other kinds, closed cases or deleted events) sets the event, its space and the SPACE desk, clears escalation and assignee, posts a SYSTEM line and notifies the space desk and the requester (new D3 kind `SENT_TO_SPACE`). Apex Assist shows a "Send to organiser" card with an event search on open Platform help cases, up front when AI triage says SPACE (prod case #227 is the first one). No migration; rebuild backend + apex.
- **2026-10-19** · A10 (#228): the organiser platform fee starts **Mon 2 Nov 2026** (Starter 2.5, Pro 1.5, Enterprise 1) on tickets sold from then. Space banner for Space Admins and Curators on subscription spaces, Terms updated (14 days' notice for any rate change, buyer fee 5% capped at ₹99 unless included). Email goes out from Apex on 19 Oct; on 2 Nov an admin sets the rates in Apex Plans.
- **2026-10-19** · D21 (#229): a ticket report ("Report an issue", `ContentReport` REGISTRATION) also opens an Assist HELP case linked by `subjectType` ContentReport + `subjectId`, one per report, through `createTicket` with the registration as context: ticket and event reasons land on the event's space desk, `payment_issue`/`refund_issue` file as PAYMENTS and stay with Platform (D2). Claimed seat holders can report too. Report endpoint unchanged; response adds `caseId`. Event and space reports stay moderation-only. Backend jest 986/986 (after merging main). No migration; rebuild backend.
- **2026-10-19** · B18 (#230): Huddle sessions: web `/session/[slug]` page (reminder emails no longer 404) + `/session/*` and `/huddle` in AASA and Android intent filters (native, rides 5.0.0); sessions listed on space pages (`GET /sessions?spaceId=`) with a Copy public link in Space; ending while recording keeps the recording; Space allows camera/mic for Go live and scanning; mobile lists my registered sessions; register/pay sends a confirmation with a calendar invite; cancel refunds run in the background and every attendee is emailed with the organiser's reason once their money goes (retries too); no rescheduling into the past, and a moved session emails registrants an updated invite; a plan downgrade no longer blocks cancel/refund/attendees of sessions already sold; removed co-hosts are kicked and host tokens last 15 min. Backend jest 984/984. No migration; rebuild backend + web + space; mobile parts ride 5.0.0.
- **2026-10-19** · Track D: D10 built (mobile only). Profile › Support "My help" lists every case I raised (all kinds, newest activity first, unread dots); the thread shows SYSTEM lines as timeline text and labels desk replies by who held the case (organiser or Unifesto). The same `/manage/support/:id` screen is the space desk's view (its pushes already land there): replies, internal notes, Escalate to Unifesto, read-only once with Unifesto. Manage space › More › "Assist inbox" (`/support/spaces/:id/desk`, shown when `/desk/unread` answers, with the count) has the web D9 filters and search. Apex mobile inbox gains kind, desk and unread filters and an Unread stat; the Apex thread shows desk, internal notes and "Send to organiser" with an event search (#227). "Get help" in the event and ticket menus opens a new case with eventId or registrationId (a group member's ticket sends the event) and says who answers by category. Shared `components/support/CaseThread.tsx`. Mobile tsc clean. No backend change. Ships in the 5.0.0 store build.
- **2026-10-19** · A20 + A22 (#233): a payout nets the space's overdrawn events (held once across the space, as Space Financials shows), takes a per-space lock and only pays an eligible account; a second capture on an already-paid event, waitlist, stay, seat add-on or session row is refunded in full under key `dup:<paymentId>`. Backend jest 1004/1004 on Node 24. No migration; rebuild backend. Not deployed.
- **2026-10-19** · B14 (#232): numbers say what they count. Space: Overview tiles say People (attending / checked in / not checked in); Tickets, Check-in and Tracking say Bookings (a group counts once); dashboard 'People attending'; Finance shows net as a share of ticket sales ('% of ticket sales is yours'), not of collected (which includes the buyer fee). Apex: one `inr()` formatter (en-IN, 2 decimals when there are paise) on every money page; Overview tiles 'Gross sales (GMV)' (was an unformatted 'Revenue'), 'Bookings', and Events no longer counts hidden events (backend); Transactions 'Gross sales (GMV)' matching Overview; Financials explains why Collected is wider. Mobile Apex hub: 'Gross sales (GMV)' with 'collected in 6 months (all sales)' under it, 'Total bookings'. The number sources themselves converge in T6/A23. Rebuild backend + space + apex; mobile JS-only.
- **2026-10-19** · A28 (#234): team changes (remove, add, add-order, handover) refuse unpaid, cancelled or waitlisted groups; admin transfer moves seat 1, withdraws a pending lead handover and emails both people; members get only their own seat ticket (no form answers, payment ids or teammates' QRs); invites and roster edits need a booked group and are throttled; typed-in teammates are mailed their own revocable seat ticket; claims and the invite list need a verified email (email OTP sign-in verifies import-made identities); claim writes seat and ticket together; resend never picks a teammate's QR; Allow next N skips a group that doesn't fit. Migration 20261029160000 (data only). Deploy: migrate + rebuild backend. Not deployed.
- **2026-10-19** · A29 (#236): money rows no longer cascade. Registrations, refund requests, stay bookings, extra-seat payments and session registrations now RESTRICT their event, session, stay, registration and user (migration 20261029143700, 11 FKs, no data change; payouts already restricted). Event, session and space delete go through one guard, `deleteWithoutMoney`: it refuses while money exists, clears unpaid rows, and maps a late FK hit to the same clear error. Series schedule edits delete only occurrences nothing points at; off-schedule survivors are detached, and cancelled when nobody is still booked. Series parents are out of auto-complete. Mobile Delete space copy now says money blocks the delete. Deploy: migrate + rebuild backend; mobile copy rides 5.0.0.
- **2026-10-19** · A29 follow-up (stuck series parents): read-only prod check found no recurring events at all (0 series parents in any status, 0 occurrences), so no parent was auto-completed before #236 and nothing needs setting back to PUBLISHED. No prod write.
- **2026-10-19** · A26 (#235): confirms on the remaining one-tap actions (Apex space promote/state/approve/verify, payout cancel, push, email, app version; mobile orphan attach, WhatsApp blast, IAM grants, plan switches and prices, app version, Space admin promote; Space email). Push, email and WhatsApp sends show a server-resolved count (new `audience` endpoints reuse each send path's recipients and opt-outs) and offer a send-to-me test (new `test` endpoints). Apex push picks events/spaces by name, not pasted UUID. Minimum app version above the latest is rejected server-side. No migration; rebuild backend + apex + space, mobile rides 5.0.0.
- **2026-10-19** · B12 (#239): Space polish from the visual audit. Event overview reuses the layout's event (shared `EventLayoutContext`, was fetched twice); em dashes out of Tickets, Waiting list, WhatsApp, Reports and Settings copy; one h1 per event page; hackathon `Field` and the edit page's Selects label their inputs; attendee rows: the name is a real link (no `role=button` around a checkbox); duplicate Back buttons under the breadcrumb removed; status badges in words ('Checked in', not 'ATTENDED' plus a second chip); 'organiser' copy replaced in co-hosting, sponsor portal and Apex requests; sub-event picker only offers events during the big event; hackathon queues and help desk stop polling once the event is over; every date in Space and Apex formatted en-IN; sessions empty state no longer promises 'a meeting link'; header fits 375px and the IAM grid says it scrolls. No backend change; rebuild space + apex.
- **2026-10-19** · A28 QR follow-up (#238, on #234): admin transfer rotates the booking's QR and its own tickets' codes in the same transaction (old-claim seat tickets stay) and mails the new holder their pass; removing or replacing a teammate who may hold the group's shared QR (mailed before A28) rotates it, mints stamped seat tickets for the typed-in teammates still on it and mails them and the lead. Scanner resolves codes from the DB, so old copies stop at once (an offline roster keeps them until it re-syncs). Backend jest 1035/1035 after merging main. No migration; rebuild backend. Not deployed.
- **2026-10-19** · Deployed main aa30e07 (backend, web, space, apex, cert-worker): server source = main, 169 migrations, 3 backend replicas healthy, /health 200. Now live server side: A10, A20, A22, A26, A28, A29, B12, B14, B18, D8, D21, Send to organiser (#227), O12/O13 Apex parts. Mobile parts (A26, A29, B14, B18, D10, H12, O13) ship in the 5.0.0 store build.
- **2026-10-19** · B13: Space email compose and templates get a simple editor (bold, italic, heading, lists, link, merge tags at the caret) with an HTML tab for custom bodies. Output is allowlisted, paste is plain text, styled templates open in the HTML tab, and the preview iframe is sandboxed (J11 part 1). No backend change; rebuild space. (#241)
- **2026-10-19** · K8: public lists show live and past events. /events and home fetch upcoming then past events (`when=past`), the status tabs filter now, the Completed badge shows, and home says "Recently on Unifesto" instead of an empty search result. Space pages on web and mobile list past events (`when=all`, opt-in for older apps), and the sitemap includes past events at lower priority. Rebuild backend + web. (#243)
- **2026-10-19** · D5 built: space, status, ownership, sub-space, free-add and ticket-transfer requests open REQUEST cases on the Platform desk; sub-event attach and event ownership transfer open them on the deciding space's desk; decisions post SYSTEM lines and resolve the case (`SubjectCases` events helper, no notifications of its own). B9: Space settings "Parent space" card files sub-space requests, and the endpoint now requires a Space Admin of a named space. White-label requests are self-serve, so no case. No migration; rebuild backend + space. (#242)
- **2026-10-19** · C9 confirmations and event mail now reach the right people once (IST times, attending plus claimed group members only, paid/free/waitlist push and QR, stay emails, space review emails, invites marked sent only when Meta accepts); deploy needs a backend rebuild only, no migration. (#246)
- **2026-10-19** · K9: public event page fits phones (mobile grid), shows times in the event's timezone, hides Register when sold out or closed, and server-renders agenda, speakers and FAQs from one fetch. Fake /docs (now 301 to /help) and the mock registration success page are gone. iOS hands off to the App Store without the invalid-address alert, desktop keeps the page context, and claim links join AASA. Web only; deploy web. (#251)
- **2026-10-19** · D7 built: event request. Someone without a space files event basics (web /request-event, mobile Profile › Hosting "Host one event"); it opens a REQUEST case (EVENT) on the Platform desk; Apex Assist approves (shared createApprovedSpace: personal space they run + STARTER plan, event as DRAFT, one claimed transaction) or rejects with a note; the requester hears through D3. Migration 20261030100000; rebuild backend + apex + web; mobile rides 5.0.0. (#244)
- **2026-10-19** · D24 built: account deletion is a PRIVACY case on the Platform desk (subject User). Request posts the erase date (status PENDING), cancel and the daily erase post their lines and close it; a new request reopens it. Mobile My help thread shows "Keep my account" while pending. No migration; rebuild backend; mobile rides 5.0.0. (#247)
- **2026-10-19** · Track D: D6 built. Every refund request is an Assist case (REFUND, or CANCELLATION for a paid cancel or cancelled event): curator stage on the Space desk, forwarding moves it to Platform, decisions and settlement post SYSTEM lines and resolve it; a paid registration cancel is one flow that creates the refund and records cancellationReason; cancelEvent refunds open their cases the same way. Space Assist reviews refunds in the case. Data migration 20261030120000 backfills cases for open refunds. Rebuild backend + space. (#245)
- **2026-10-19** · C10 + C11 inbox splits staff help-desk queries into a Staff tab with mark-all-read, title cut to 200 and bell refresh on every push; segment broadcasts now read their real sent/failed from OneSignal (its create response dropped `recipients`; the 27 Sept "All users" app-update pushes actually reached 1126 and 1120 devices with 15 and 1 failed) and Apex push/email/WhatsApp consoles gain a staff-only test audience. Needs migrate deploy + rebuild backend + apex; mobile rides 5.0.0. (#249)
- **2026-10-19** · C3 + C2 add a message_deliveries log with retries and dedup for every push/email/WhatsApp send, plus NotifyService.notify() with a kind registry and one channel policy (notify.policy.ts). Needs `prisma migrate deploy` (20261031100000_message_deliveries) and a backend rebuild; no env changes. (#248)
- **2026-10-19** · Track D: D23 built. A guest asking to cancel a stay paid online opens a CANCELLATION case on the event's Space desk (Space Assist "Cancel and refund", mobile "Ask to cancel and refund"); the team's cancel posts the refund and resolves it. A host's session cancel opens a case per paid booking, resolved when its refund goes. Money logic unchanged. No migration; rebuild backend + space. (#252)
- **2026-10-19** · Track D: D19 built. Saved replies (`CannedReply`, Unifesto desk + per space) with CRUD and an insert picker in Apex and Space Assist; SLA due time from priority (Grievance 24 h / 15 days), overdue filter, and 30-day median first-reply and resolution times per desk in both stats headers. Migration 20261101100000. Not deployed. (#254)
- **2026-10-19** · C8 marketing sends now carry a signed unsubscribe link, one-click List-Unsubscribe headers and the postal address. Recipients exclude opt-outs, deleted accounts and, for platform bulk mail and WhatsApp marketing templates, anyone without promotions on. WhatsApp STOP is recorded and blasts are audited. Needs migration 20261030100000_marketing_opt_out plus a rebuild of backend, space and apex, and an OTA for mobile Apex. (#250)
- **2026-10-19** · C5 + C6 built. Email delivery webhooks are live at POST /webhooks/ses (SNS signature + topic allowlist) and POST /webhooks/resend (Svix), and WhatsApp status callbacks now update the delivery log by wamid. Hard bounces and complaints go to a new email_suppressions list (migration 20261101100000_email_suppressions); every email send except sign-in codes skips suppressed addresses and logs SUPPRESSED, and campaign audiences drop them. Apex gets a Messages page (failures, top errors, delivery log, suppression list with add/remove) and a Messages card on each user's page, backed by /admin/messages, /admin/messages/stats and /admin/email-suppressions. New env SES_SNS_TOPIC_ARNS and RESEND_WEBHOOK_SECRET; manual setup is an SES -> SNS topic with an HTTPS subscription to /webhooks/ses and a Resend dashboard webhook to /webhooks/resend. Deploy needs migrate deploy plus a rebuild of backend and apex. OneSignal per-user delivery is skipped (needs OneSignal-side event streams). (#257)
- **2026-10-19** · Track D: D20 built. Hourly cron closes RESOLVED cases 7 days after resolution; requesters rate resolved cases 1-5 with an optional comment (new `rating_comment`) in Space Support and mobile, shown to the desks. Migration 20261101110000. Not deployed. (#253)
- **2026-10-19** · Track D: D25 built. Public `POST /support/grievances` (email sign-in code) opens a GRIEVANCE case on the Platform desk, held to 24 h / 15 days by D19's SLA; `/grievance` on web has the form. Officer name/email still from `LEGAL.grievance`, awaiting I1. No migration. Not deployed. (#256)
- **2026-10-19** · C2 notify migration: stays (6 notices), space approve/reject, waitlist offer, event cancel/update (via new NotifyBatch bus event) and the payment receipt now go through notify(); registration.confirmed stays direct (Redis guard also covers the group fan-out) and the T-24h/T-1h reminders stay direct (per-user notify would unbatch the OneSignal push and drop the QR email for push users); backend rebuild only, no migration. (#258)
- **2026-10-19** · C4 notification preferences: push x email grid per category (new email switches for event reminders and new events), quiet hours in IST that hold non-critical pushes until the window ends via OneSignal send_after, and settings switches for marketing email and WhatsApp that read and write the C8 MarketingOptOut rows, with per-space re-subscribe. Migration 20261102100000_notification_preferences_grid (4 columns on notification_settings). Needs migrate deploy and a backend rebuild; the mobile settings screen rides 5.0.0. (#260)
- **2026-10-19** · D15 built: desk copilot in Apex and Space Assist. "Draft reply" fills the composer from Claude Haiku 5.5 (sent replies marked aiDrafted), a thread summary on open and on escalation (aiSummary, refreshed when the thread moves), and booking facts computed by code next to it (refundable now, refund window, open refund stage, cancel rule incl. D6). Ships dark behind `desk`. Eval 10 cases, 30/30 clean over 3 runs, ~$0.001 a run. Migration 20261102100000; rebuild backend + apex + space. (#255)
- **2026-10-19** · D14 built: Assist bot. A chat is a BOT case (desks don't see it until handoff); Claude Haiku 5.5 at effort medium with read-only tools (my bookings, code-computed booking facts, event FAQ, help articles) proposes action cards that code validates and the person confirms in the app (request a refund, cancel); "Talk to a person", a handoff call or any AI failure flips it to OPEN with the chat as the thread, then triage and notifications run. Mobile front door: My help, ticket and event "Get help" with a DPDP notice; web comes with D11. Ships dark behind `bot`. Eval 12 chats, 35/36 clean over 3 runs, ~$0.0004 a chat. Migration 20261102200000; rebuild backend, mobile rides 5.0.0. (#259)
- **2026-10-19** · D11 built: unifesto.app/help/contact opens a case through Assist. Guests give an email; the account is found or created like a manual attendee add (never renamed), so requesterId stays set. The bot runs with public tools only (help articles, event FAQ). The guest's per-case token reads only their own and the bot's messages; desk replies go by email. "Talk to a person" or no answer opens the case for the desk. FloatingSupport leads with "Ask Assist", and WhatsApp and email stay. No migration; rebuild backend + web. (#261)
- **2026-10-19** · Deploy fix: backend build now excludes spec-only `*.testing.ts` helpers (jest broke `nest build`), and deploy.sh no longer shields the deleted `backend/src/aws/examples` from rsync --delete. (#262)
- **2026-10-19** · G9 mobile API client unified: refresh signs out only on a refused token, one token source, ApiError convention, error states, crash fallback, cold-start push links (#263)
- **2026-10-19** · M3 AI post-event report summary: code-computed facts, stored on the report, PDF + space page, regenerate, 8-case eval (off by default; no feedback themes yet) (#264)
- **2026-10-19** · G12 mobile screen fixes: shared email check, iOS alert/crop overlay, Stays desk collect-and-check-in, live ticket pass, faster event page with sold-out/closed states, decimal number answers, favourite sign-in prompt, space role + team by slug (#265)
- **2026-10-19** · M1 AI event draft: notes or a link → editable description/agenda/FAQs on the space edit page, applied per section; `event_draft` feature off by default, SSRF-guarded link import, 10-case eval (#266)
- **2026-10-19** · G10 part 1: groups check in per member everywhere, audited undo, soft-deleted points, late offline sync, people-based stats, Space recent card on /recent (#267)
- **2026-10-19** · G10 part 2: member pass reads own check-ins, offline queues sync on foreground/reconnect and never across accounts, file-backed guest lists, proactive download (#268)
- **2026-10-19** · H25: custom-domain CORS for notify/inquiry, encoded branded From + fallback, hourly domain re-check, TXT ownership + claim expiry + provider cleanup, no Unifesto chrome on custom domains (#269)
- **2026-10-19** · G10 mobile check-in Undo (scanner success card, event hub recent rows, search "Checked in" rows) via POST /checkin/undo; online only, roster refreshed after undo (#270)
- **2026-10-19** · L1 live polls: organisers launch polls from Space web and mobile manage-event, attendees vote once from their ticket while the event is live, and results update over a new engagement socket room. (#271)
- **2026-10-19** · N1 badge/pass printing: Space roster "Print badges" (A4 sheet with cut marks or 4x3in / 62mm / DYMO labels), one badge per claimed group seat on the member's own QR, streamed PDF (#272)
- **2026-10-19** · G2 mobile on-site tools survive offline/slow networks: 15s/90s request timeouts, last-good copy instead of wiping on 5xx/timeout/offline, retry for upserted writes only, one offline/saved-data banner (#273)
- **2026-10-19** · G13 mobile polish from the 18 Oct device audit (number figures, status-bar scrim, bare icons, city label, draft counts, host logo) (#274)
- **2026-10-19** · Removed the dead global font patch; LiveSession text sets DM Sans explicitly (G13 follow-up) (#275)
- **2026-10-19** · G11 ended-event states on mobile ticket + Sprint hub; Space end-of-event checklist (#276)
- **2026-10-19** · G4 long mobile lists (waitlist, manual check-in, teams, queues, results, leads, coupons, sessions, group) on FlatList (#278)
- **2026-10-19** · L2 live Q&A: ask, upvote, moderation queue on Space web + mobile (#277)
- **2026-10-19** · H14: certificate emails go via Resend from the space's verified sending domain; otherwise SES unchanged (needs H20 Resend upgrade) (#280)
- **2026-10-19** · D22 built: payout requests and payout-account verification open Platform REQUEST cases (Payout / PayoutBankAccount); paid, cancelled, verified and rejected post SYSTEM lines and resolve them, so "why was my account rejected?" is answered in the thread; money logic and S23 stay in payouts.service; Apex Assist Payout panel. No migration; rebuild backend + apex. (#281)
- **2026-10-19** · D26 Apex WhatsApp "Convert to case" (picked messages → Platform HELP case, number matched to account, conversation links to it) and D27 hackathon help desk "Escalate to organiser" (Space web + mobile → Space-desk case with team/room, query keeps escalatedAt + caseId); additive migration 20261105100000_assist_links; rebuild backend + apex + space. (#282)
- **2026-10-19** · I5 account deletion now completes for paid-out organisers (bank rows scrubbed, not deleted), erasure covers tickets, certificates, support, notifications, WhatsApp, all avatars and Cognito, failures reach the PRIVACY case; personal-data retention limits added to the daily sweep (#283)
- **2026-10-19** · L3 live quizzes: server-timed questions, scoring, live leaderboard on Space web + mobile (#279)
- **2026-10-19** · D26 mobile, Apex WhatsApp thread gets "Convert to case (n)" (tap to pick messages, unanswered inbound pre-picked) and "Open case" once linked; JS-only, ships with the next mobile build/OTA. (#284)
- **2026-10-19** · G5 space web EmptyState rollout across stays, attendees, check-in, transactions, tracking and branding settings (#286)
- **2026-10-19** · I1–I2: versioned legal docs (LegalDocument/LegalAcceptance, public GET /legal/:slug, pending + accept), web legal pages render from the API, blocking accept sheet in space + mobile, Apex editor; I1 drafts + I4 retention line await lawyer review. Not deployed. (#285)
- **2026-10-19** · L4 projector view: full-screen read-only Space page for poll results, the Q&A wall and live quizzes, opened by operators or with a revocable display link (no login, no attendee PII). (#287)
- **2026-10-19** · O17 mobile: Firebase Analytics + fake consent removed, one iOS IAP rule for paid sessions and online events, price-free billing, sticky forced-update gate, /claim app links, sensitive Android permissions blocked, 8 unused deps dropped, masked-view patch via patch-package (#289)
- **2026-10-19** · F7 mobile What's new sheet for 5.0.0: shown once after updating (never on fresh install), organiser section for operators, Profile › What's new reopens it (#290)
- **2026-10-19** · H23 branded registration and stay emails use a neutral "find your ticket in the Unifesto app" line. (#288)
- **2026-10-19** · O17 backend: Apple sign-in stores an encrypted refresh token, and account deletion revokes it at Apple (5.1.1(v)); failures are reported on the PRIVACY case. Needs migrate + APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY env before submit. (#291)
- **2026-10-19** · J13 deploy.sh refuses dirty trees, non-main HEADs and non-green CI (FORCE=1 override), guards DROP migrations, tags images by SHA with ./deploy.sh rollback, and checks required env keys (#292)
- **2026-10-19** · J4 Sentry projects created (unifesto-backend/web/space/apex/mobile); backend DSN set, @sentry/nextjs wired into web, space, apex (errors only, PII masked) (#293)
- **2026-10-19** · J4 mobile Sentry (@sentry/react-native via Expo plugin, project unifesto-mobile), native: rides the 5.0.0 store build (#294)
- **2026-10-19** · J4 web source maps: apex/space/web upload to unifesto-<app> at build via a BuildKit secret, maps deleted after upload (#295)
- **2026-10-19** · J4 mobile source maps: EAS builds upload to unifesto-mobile (SENTRY_AUTH_TOKEN EAS env), metro on getSentryExpoConfig, OTA upload step in docs/OTA.md; native, must merge before the 20 Nov freeze (#296)
- **2026-10-19** · Backend loads .env before Sentry and the JSON logger read it (fixes the boot crash with LOG_FORMAT=json; Sentry now actually starts) (#298)
- **2026-10-19** · JSON request logs redact the internal key, OTA status secret, projector display token and Razorpay signature (#299)
- **2026-10-19** · O17 follow-up: iOS purchase rule now also covers waitlist-offer payments and paid add-seats on online events; backend returns the event type on the waitlist and team responses. (#300)
- **2026-10-19** · Repeat Assist cases join the open one; mobile no longer pre-opens a case for refunds (#301)
- **2026-10-20** · U1–U3 built: EMPLOYEE role (PLATFORM) with company/product capabilities, setGrant lock on platform:manage + company:manage for EMPLOYEE, `PUT /admin/users/:id/employee`, `platform` in `/users/me/access`, capability-gated Apex nav/⌘K + no-access panel, Make-employee toggle, Employee row in the IAM console, space app sends employees to Apex, PM REST routes on product:view/edit (MCP stays ADMIN). Migrations 20261107100000 + 20261107110000. Backend jest 60/60 on Node 24. Not deployed. (#302)
- **2026-10-20** · Unifesto Orbit campus programme: Orbit Lead record, tiers + inactivity clock, Apex leaderboard, space Orbit page, public /orbit + terms (#303)
- **2026-10-21** · Orbit apply page (/orbit/apply, applications, Apex queue), certificate + badges + quarterly goodies on /orbit, Orbit in brand kit and press, Orbit across India map (public aggregate API), welcome kit (Lead/Crew), Orbit Crew role (#304)
- **2026-10-21** · deploy.sh prunes Docker build cache and dangling images before every build (ENOSPC fix) (#305)
- **2026-10-21** · web share cards for every public page (/og route + help article + Huddle session cards) (#306)
- **2026-10-21** · Orbit launch marketing kit tooling (marketing/orbit-launch): 4K 1.43:1 YouTube cut, 9:16 Short/Reel, Instagram stills, copy (#307)
- **2026-10-22** · J8 group size capped on every registration path (MAX_GROUP_SIZE 100) (#308)
- **2026-10-22** · J11 email HTML sanitised at save+render, apex preview sandboxed, certificate backgrounds locked to our S3 host with 15 MB/no-redirect fetch and pre-decode dimension check (#310)
- **2026-10-22** · T8 hotfix: real IST period ends + backfill, cancel at period end, plan checkout blocked on FREE/REVENUE_SHARE (#312)
- **2026-10-22** · J10 cross-tenant writes closed: deleteTicketType event check, PATCH /spaces type/parent/coCuratorLimit platform-admin only + cycle guard, attachSubEvent checks parent, analytics CTE path/depth-bounded with statement_timeout (#313)
- **2026-10-22** · J9 public event/session APIs stop leaking private fields: PUBLIC_EVENT_CARD_SELECT allow-list on lists/favourites, onlineUrl only for operators + ticket holders, no join link in public .ics, recordingUrl only for registrants (#311)
- **2026-10-23** · T1 Co-Curator escalation closed: publish/cancel/hide/restore/delete need EVENT_PUBLISH/EVENT_CANCEL (no co-host fallback), team edits need EVENT_ASSIGN_CREW with rank rules + coCuratorLimit + audit log; space + mobile controls gated (#309)
- **2026-10-25** · Auto-blog: 50-question queue, 3/day researched + humanized + gated posts, Search Console learn, author box (#314)
- **2026-10-25** · 5.0.0 launch prep: Play submit uploads a draft (never auto-live), OTA.md store-launch runbook (beta, phased release, pause rule) (#315)
- **2026-10-25** · J12 Redis client reconnects forever (OTP 503 when down) and IAM/plan/platform config caches sync across replicas via a Redis stamp (~2s, 30s floor) (#316)
- **2026-10-25** · J14 deploy.sh stops syncing .env files (server-side env gate), local dev compose + .env.development.example, backend/prisma refuse RDS unless NODE_ENV=production (#317)
- **2026-10-25** · P23 UPI IDs masked in payout pickers/lists; demo space + users left out of financials, analytics and stats broadcasts; no link to a private host space (#318)
- **2026-10-25** · E8 privacy: removed the legacy public score socket (live scores leaked to attendees) and gated participants-only brackets to attendees, panelists and operators (#319)
- **2026-10-25** · K10 slice 1: free/RSVP registration on web (email OTP sign-in, questions, UTM), paid/group/file still hand off to the app (#321)
- **2026-10-25** · Next 16.4.2 in web/space/apex (critical image-optimiser RCE advisory); ignoreBuildErrors removed; CI blocks critical runtime advisories; Dependabot monthly (#320)
- **2026-10-25** · K6 web visits + referrer domains via first-party cookieless PageView beacon; Z7 weekly scorecard on Apex Overview (#322)
- **2026-10-25** · T8 subscription lifecycle: grace/expiry status drives entitlements, webhook+verify idempotent activation, renew, prorated upgrade, period-end downgrade, cron re-check, payment-based MRR, Apex offline payments (#323)
- **2026-10-25** · J17 auth hardening: lowercase emails + E.164 mobiles at auth entry (case-insensitive lookups), OTP send failure = 502 + cap refund, WhatsApp OTP +91 allowlist, Apple/Cognito fail closed, /auth/google removed, identifier OTP lockout 15→40, Apex/Space ?next= same-origin only (#333)
- **2026-10-25** · J16 space status enforced: one PUBLIC_SPACE_STATUSES (APPROVED+ACTIVE) gate for listings, event feed/detail/ICS, publish, checkout and payout requests; private-space events out of the public feed; web "temporarily unavailable" page (#332)
- **2026-10-25** · Dependabot no longer opens mobile PRs (Expo SDK pins native versions; #330 broke npm ci) (#334)
- **2026-10-25** · J2 backend reliability: boot failure exits, stranded push sweep + resend, refund retry crons locked/indexed/alerted, email queue Redis-down fallback, starting-soon window fixed (#339)
- **2026-10-25** · Z11 18+ self-registration confirmation (User.ageConfirmedAt, requireAgeConfirmation flag off, mobile gate + web RSVP + Apex toggle), breach runbook in PR body (#340)
- **2026-10-25** · A32 manual payouts: required unique UTR + paidBy/paidAt, transfer details with copy in Apex, payout emails, revoke verification, UPI + make primary in Space (#341)
- **2026-10-25** · T3 GET /spaces/:id/access (effective caps + enforced plan); Space nav/pages and mobile event hub gate on it, rbac.ts matrix and /usage features call dropped (#342)
- **2026-10-25** · Dependabot skips major versions (Prisma 7 / TypeScript 7 bot PRs closed) (#343)
- **2026-10-25** · mobile follow-ups J2 resend FAILED push, J17 drop dead loginWithGoogle, J16 space-unavailable state; Z11 copy checked (no change) (#345)
- **2026-10-25** · J17 ILIKE wildcard re-check on all email equality lookups; T3 co-host Space Admin gets event:edit in access; J16 suspended-space gate on curator attendee adds; space Danger zone on event:cancel (#347)
- **2026-10-25** · J19 CI: next build for web/space/apex + backend migration replay & pinned drift check (backfill migration for 4 untracked tables) (#346)
- **2026-10-25** · T4/T5 Deals + TermsService + integer-paise quote() on all paid paths, POST /quote, Apex Deals card; parity-proven vs old fee maths (#348)
- **2026-10-25** · K10 slice 2: paid individual ticket checkout on the web (server quote, coupons, Razorpay Standard Checkout, verify; ₹0 via coupon; mixed free+paid); GROUP and FILE still in the app (#349)
- **2026-10-25** · demo-space.ts slugs match prod (no -demo suffix), so --remove finds the space (#350)
- **2026-10-25** · P23 demo exclusion now matches the prod demo Space slug (aurora-tech-club); the script shares the constant (#351)
- **2026-10-25** · Web events copy no longer names Malla Reddy University as the only campus (#352)
- **2026-10-25** · J17 refresh-token reuse revokes all sessions, 365-day absolute cap, POST /auth/logout-all (#355)
- **2026-10-25** · J17 Apex/Space login limiter keyed on Caddy's client_ip, expired entries pruned (#356)
- **2026-10-25** · J17 account gets an email when a new sign-in method is linked (#358)
- **2026-10-25** · K12 web registration records Terms/Privacy acceptance (LegalAcceptance, client web) (#353)
- **2026-10-25** · K13 web checks a signed-out discount code after sign-in and stops on the final total (#354)
- **2026-10-25** · J19 web has its first frontend tests (node --test, no new deps), run in CI (#360)
- **2026-10-25** · K15 web /tickets page with QR + resend my ticket on the already-in screen (#359)
- **2026-10-25** · K14 web strict nonce CSP (pages now per-request) + web session capped at 24h (#364)
- **2026-10-26** · J19 slice 3 — money modules typed (33 any → 0), CI any-count guard (#361)
- **2026-10-26** · J17 logout blacklists the caller's access token (Apex/Space sign-out now revokes server-side) (#363)
- **2026-10-26** · T8 #365: plan checkout/renew/upgrade credit/offline/admin edit/MRR priced from the space deal; history rows record price_paise + deal_id; Apex shows price in force (#365)
- **2026-10-26** · E8 hackathon judging integrity: panel race, COI guard, no-mark force-complete, criteria lock, top-N/decision confirms, award unpublish revokes certs (#366)
- **2026-10-26** · J17 Apex and Space send a nonce-based CSP script-src with strict-dynamic (#367)
- **2026-10-26** · J19 lint gate: web/space/apex lint clean (errors) and run in CI (#362)
- **2026-10-26** · J19 reconciliation migration pays down the db-push drift; known-drift.sql is down to 2 deliberate diffs (#357)
- **2026-10-26** · K16 web dates formatted in IST (server UTC vs browser IST caused React #418); Cloudflare Web Analytics auto-injection turned off (#368)
- **2026-10-26** · T6 slice 1: one settle() at each sale's frozen fee feeds payouts, export, Space+mobile Transactions tiles (server endpoint, Net now carries the platform fee), ticket-type and sub-space revenue; per-payout fee override dropped; forced reconcile delta goes to the organiser base. Left: Payout.sessionId (A17) (#376)
- **2026-10-26** · A11 site and Space billing state both fees honestly: buyer 5% capped ₹99 (Razorpay inside it), organiser fee "from 2 Nov 2026", ₹500-pass example from the rate card, fee on event page, real annual saving (#370)
- **2026-10-26** · J4 slice 1: Sentry now gets BullMQ job failures (after last retry) and every @OnEvent listener error (#369)
- **2026-10-26** · J4 slice 3: Caddy access logs (the CERT-In record) now really keep 180 days; Apex logs page states true retention and sampling (#372)
- **2026-10-26** · J4 slice 4: error.tsx + global-error.tsx reporting to Sentry on web/space/apex; blog/help/verify show try-again on API failure, real 404 only on 404 (#373)
- **2026-10-26** · J3 slice 1: page/limit parsed safely and capped on every hand-parsed list endpoint (public /spaces max 50); public space page no longer loads every member (#377)
- **2026-10-26** · T10 part 1: /config/plan-fees serves the whole plan_configs row, PLAN_LIMITS pinned to the seed by a spec, blank platform fee is a 400 not a 500, dead Apex user-keyed subscription API removed; columns kept for a later contract migration (#374)
- **2026-10-26** · J4 slice 5 + J3 status load: status uptime counts incidents and says it isn't an outside probe; mobile Apex can report and resolve incidents (#375)
- **2026-10-26** · J4 slice 2: autoheal restarts unhealthy backend/cert-worker, container logs capped at 5x10 MB, no-op Caddy active health check removed (#371)
- **2026-10-26** · J3 slice 2: email brand lookup memoised per event (no N+1 on publish/cancel fan-outs); 11 redundant indexes dropped (#379)
- **2026-10-26** · T10 part 2: /pricing and llms.txt render plan prices, limits and features from plan_configs; Space billing lists every plan flag (#381)
- **2026-10-26** · T6 slice 2: Huddle sessions pay out (Payout.sessionId, exactly one source), session sales freeze the organiser fee (trigger + backfill), session money in Space/Apex financials and breakdown; Space payouts list paid sessions (#389)
- **2026-10-26** · J3 slice 3: GET /admin/queue-counts; mobile Apex home counts every queue in one call instead of downloading 10 lists (#380)
- **2026-10-26** · J5 slice 2: WhatsApp group-invite blast queued on BullMQ with claim-before-send (no more timeouts or double sends) (#383)
- **2026-10-26** · J5 slice 4: CSV import capped at 1,000 rows (preview + import); import confirmations sent 5 at a time after the rows (#386)
- **2026-10-26** · G1 mobile desk editors replaced by "open on web" handoffs; 38 screens deleted (#378)
- **2026-10-26** · H20 custom sending domains gated by PlatformConfig switch (default off, Apex toggle); studio shows coming soon; Resend limit refusal is a 403 (#391)
- **2026-10-26** · H15 phase 1: mobile Apex white-label queue removed; POST /white-label/requests sends Deprecation header (#388)
- **2026-10-26** · G3 every remaining mobile screen on cosmos (palette codemod + ~100-screen structural pass) (#385)
- **2026-10-26** · G8 event-day cockpit on mobile: live check-ins, today's money, help desk, announcements (#387)
- **2026-10-26** · G14 accessibility: labelled inputs (mobile + 100 web labels), reachable card hearts, AA legacy palette, Dynamic Type-safe controls (#390)
- **2026-10-26** · Support stats batch their queries (≤3 connections) instead of 10 at once; fixes pool timeouts UNIFESTO-BACKEND-6/7 (#392)
- **2026-10-26** · Apex AI feature switches (platform_config.aiEnabledFeatures) and Retry for failed auto-blog questions (#393)
- **2026-10-26** · Apex traffic page no longer 500s on page views without a space (UNIFESTO-BACKEND-8) (#394)
- **2026-10-26** · Mobile tabs: removed StatusBarScrim, which blacked out the status bar in dark mode (#395)
- **2026-10-27** · Plan lineup General/Club/Growth/Pro/Enterprise, Free and Revenue-share models removed (6 Free spaces → General), buyer fee 4%, Apex Plans/Subscriptions, Space billing and /pricing redesigned on one feature catalog (#396)
- **2026-10-27** · T9 plan enforcement: waiting list, recurring events, WhatsApp blasts, leads, attendees per event (atomic), co-curators, spaces and priority support are enforced server side; Space shows the gates (#397)
- **2026-10-28** · deploy.sh pauses autoheal during the backend roll and force-removes drained replicas, fixing the half-rolled deploy of 2026-10-26 (#398)
- **2026-10-28** · Contract step for the plan lineup, dropped the retired billing_model / revenue_share_percent columns, billing_model_configs table and billing_model enum (deploy alone with ALLOW_DESTRUCTIVE=1) (#399)
- **2026-10-28** · Async event listeners return their result to emitAsync, fixing WhatsApp convert-to-case and hackathon help escalation always failing (Sentry BACKEND-9) (#400)
- **2026-10-29** · Assist bot replies with an amount, link, email or phone no tool returned are held and go to a person; Apex AI card shows each feature's last 30 days (calls, cost, failures, cache share) (#401)
- **2026-10-29** · 5.0.0 release and final deadline moved to Sun 15 Nov (freeze 6 Nov, submit 9 Nov); marketing and non-Z8 work parked on the board (#402)
- **2026-10-29** · U1–U3 follow-ups: IAM console shows never-grantable Employee cells as locked; Connect Claude (PM tokens) tab hidden from employees (#403)
- **2026-10-29** · G14 finished: last ~30 Apex/Space labels tied to their controls, shared Field + question inputs label automatically (#404)
- **2026-10-29** · F8 co-hosting is now a request: invites stay pending (no access, listing or credit) until a Space Admin of the invited space accepts on Space Events; existing links backfilled as accepted (#405)
- **2026-10-29** · K17 help centre hides itself (404, no links, not in sitemap) until an article is published; 13 starter articles as a draft seed script (#406)
- **2026-10-29** · E9 lead capture throttled, public-only, no overwrite; notify-me emails changes + day-before reminder; inquiries alert Space Admins; booth scan and I'm interested ask for consent (#407)
- **2026-10-29** · H15 Apex half: White-label History + Apply branding removed, suspend/restore moved to space detail; route + table drop wait for O6 (#408)
- **2026-10-29** · F4 user IAM: Apex can suspend (with end date) or ban a user with a reason, sign them out everywhere, and add per-user capability overrides (removals win; grants one space, never platform); auth rejects suspended users at login, refresh and every request (#411)
- **2026-10-29** · E5 hackathon submissions: curator Project links page per round (missing filter, CSV), links lock once a judge scores them, mobile stale draft fixed (#412)
- **2026-10-29** · K7 last six legal pages (code of conduct, privacy notice, data rights, privacy requests, subprocessors, security) managed in Apex as I2 documents, text unchanged (#416)
- **2026-10-29** · E11 hackathon controller split into teams, judging and results controllers (same 85 routes); curator team list pages with take/skip; judging kept, decision pending (user) (#419)
- **2026-10-29** · F5 audit trail: @Audit records who changed roles, permissions, status, plans and reconciled payments (audit_logs), shown on Apex user, space, event detail and IAM (#418)
- **2026-10-29** · K18 web: Continue with Google (Cognito code + PKCE) and sessions that survive via a host-only httpOnly refresh cookie; access token in memory only; custom domains keep the email code (#421)
- **2026-10-29** · K11 public web polish: home band, 24px link targets, quicker hero, "1 member", no empty Space banner box, labelled request-space form, scrollable organisers nav on phones, bubble tucks on scroll, empty blog/careers hidden, clean event meta, uncropped portrait posters (#424)
- **2026-10-29** · E3 sponsor portal: lead status + notes (web and app), per-event booth stats, CSV with status and note; migration 20261121120000_sponsor_lead_status (#423)
- **2026-10-29** · K1 discovery: web /events browse by city, college and real categories with every upcoming event and a trending-near-you strip; /spaces opens on active spaces; GET /spaces honours city; category renames keep events; mobile city/college browse (#425)
- **2026-10-29** · K19 web account pages: profile (username check, photo), email/marketing notification settings, self-serve account deletion with grace and cancel, saved events, my certificates; /delete-account leads with the web flow (#426)
- **2026-10-29** · F1 per-event attendee feedback: 1-5 rating, NPS and curators' own questions (registration question types), one editable response per attendee; Space Feedback page + mobile Rate this event (#417)
- **2026-10-29** · E1 shared collaborator invite: one find-or-create by email (never renames an account), invite email for sponsor portal, judges/mentors and space members; sponsor invite no longer needs an existing account (#422)
- **2026-10-29** · E10 sponsors: plan gate no longer fails open without a subscription, opt-in and booth scan check the plan, booth scan only valid tickets, UUID-validated routes, roster/opt-in/scan/funnel tests (#410)
- **2026-10-29** · E7 BoothScan works offline: consented scans queue on the phone and sync on reconnect/foreground; refused ones listed for review (StayScan skipped, Stays removed in S59) (#413)
- **2026-10-29** · E4 partner share kit done: QR for a partner's tracked link on Partner stats (link + share were already there); E2 web partner portal dropped, covered by X7 Tracking + app Partner stats (#414)
- **2026-10-29** · F2 feedback timing: checked-in attendees get a push 2 h after the end and a reminder at 48 h (notify() low kinds, once per event), feedback closes at 7 days, optional feedback-unlocks-certificate (#427)
- **2026-10-29** · F3 feedback results: averages, NPS, rating spread, question summaries, comments and CSV in Space web and mobile; opt-in public rating on the event page once 5+ attendees rated (#428)
- **2026-10-29** · G15 DM Sans 500 replaces Michroma for headlines on web, Space, Apex, mobile and share cards; tracking max(calc(0.9px - 0.062em), -0.04em); ₹ now drawn by DM Sans (Hanken lacks it); web hero up to 64px; mobile legacy font helpers and Plus Jakarta removed. Rebuild web, space, apex; mobile JS-only. (#429)
- **2026-10-29** · web backdrop is thin lines only; planet crescents and horizon bars removed from the hero and inner pages. Rebuild web. (#430)
- **2026-10-29** · palette tokens across web, Space, Apex and mobile: mint success, crimson errors (#be123c day, #ec2f58 night), amber warnings, paper day page with white cards, no blue in nav, payments, widgets or share card. Rebuild web, space, apex; mobile JS-only. (#431)
- **2026-10-29** · web: faint static film grain over every page (SVG noise overlay, 7% night / 5% day, click-through). Rebuild web. (#432)
- **2026-10-29** · web G18: mint/sky/ivory accents inside cards by role, statuses and tags as plain text instead of pills (event cards, banners, speakers, Stay). Rebuild web. (#433)
- **2026-10-29** · web G19: frosted liquid glass on the hero check-in card (vendored liquidglass, font embedding patched out); solid fallback without WebGL. Rebuild web. (#434)
- **2026-10-29** · web glass re-captures on light/dark switch (no stale black card); follow-up to #434. Rebuild web. (#435)
- **2026-10-29** · web home: frosted glass on every panel over orbit-shaped accent shade cards (sky/mint/ivory/#0062ff) + hero #0062ff orbit band + stronger grain + hero pointer light removed; glass lazy-starts, restarts on theme switch. Rebuild web. (#436)
- **2026-10-29** · web home follow-up to #436: blended shade-card shapes (orbs, horizon, beam, fan), the two-sides cards merge into one on scroll, hero orbits back to white hairlines with a Horizon-blue glow from the bottom-right corner, no black box behind the hero glass (liquidglass `backdrop` patch), centred glass panels, glass inner cards, phone screens readable by day (black island), Horizon footer (glass card over a horizon glow, legal under the stores, blended with the CTA band), day mode with blue light instead of grey glows, no stars by day, white sections. Rebuild web. (#437)
- **2026-10-29** · brand kit rewritten as the Unifesto Horizon spec (16-page guidelines, Horizon sky backgrounds, blended shade cards, theme lock in token headers); posters removed from /press, the PDF and the zip; new Night/Day app icons (no lines, u centred; iOS follows appearance, picker gains Auto). Rebuild web; native mobile rebuild for icons. (#438)
