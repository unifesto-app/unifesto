# Unifesto version 4

The living plan and log for every 4.x release: major, minor and patch.
One file for the whole major version. **Plan** says what we intend to ship;
**Log** says what actually happened. Both get updated as work lands.

Covers the mobile app (App Store / Play Store) and the backend + websites
changes each mobile release depends on.

## How to use this file

- **New release:** add a section under [Releases](#releases), newest first, using the template at the bottom.
- **Planning:** write items under the release's `Plan` with a status. Never delete a planned item; mark it `dropped` or `moved → 4.x.y` so the history stays honest.
- **Doing:** when something lands, tick it and add a line to that release's `Log`: date, what, and the PR/commit.
- **Shipping:** fill in `Shipped` (store build number, OTA update id, backend deploy time).

### Version rules

| Bump | When | Ships as |
|---|---|---|
| **Major** (5.0.0) | Breaking change: removed features, a forced update for everyone, a new app architecture | Store build |
| **Minor** (4.1.0) | New features or new screens | Store build if native code changed, otherwise OTA |
| **Patch** (4.0.1) | Fixes and copy/UI polish, no new features | OTA when JS-only, store build if native |

- The version lives in `mobile/app.config.js` (`version`). Build numbers are auto-incremented by EAS (`appVersionSource: remote`).
- OTA uses `runtimeVersion: fingerprint`. A JS update only reaches binaries with the same native code, so a release that adds a native module **must** go out as a store build.
- Publish OTA with `npm run update:production` (from `mobile/`), never a bare `eas update`.
- Backend: run the drift check and read every new migration before each `./deploy.sh` (it runs `migrate deploy` and copies local `backend/.env` over the server's).

### Status legend

`planned` · `in progress` · `done` · `blocked` · `dropped` · `moved → x.y.z`

---

## Releases

**Goal: everything below done by Sat 10 Oct 2026.** App releases every 2 days. Web and backend work ships with them through `deploy.sh`, or on its own when there's no app part.

| Version | Type | Theme | Target | Ships as | Built by | Status | Shipped |
|---|---|---|---|---|---|---|---|
| [4.0.0](#400--stabilize-and-ship) | major | Stabilize, OTA, registration questions, first store build of the redesign | **Sun 27 Sep** | store build | you | shipped (iOS 36, Android 45 approved) | – |
| [4.0.5](#405--fix-what-failed-in-400) | patch | Fix everything that failed in 4.0.0 (build, upload, QA, review) | after 4.0.0 QA | **store build** | you | shipped (iOS 39, Android 46 live) | 3 Oct |
| [4.1.0](#410--hackathon-event-day) | minor | Hackathon event day, public winners, OTA complete, sponsor/partner quick wins | **Tue 29 Sep** | OTA | OTA | shipped (100%, base for 4.1.1) | 4 Oct |
| [4.1.1](#411--smoother-event-creation) | minor (named patch) | Smoother mobile event creation, multiple categories per event | 4 Oct | OTA | OTA | rolling out (20%, 4 Oct) | – |
| [4.1.2](#412--typed-in-teammates-can-join) | patch | Teammates the lead typed in can link their account and join the hackathon | after 4.1.1 reaches 100% | backend deploy, then OTA | OTA | in review (#42) | – |
| [4.2.0](#420--support-system-complete) | minor | Support system complete | **Thu 1 Oct** | OTA | OTA | planned | – |
| [4.3.0](#430--sponsor-partner-and-hackathon-complete) | minor | Sponsor + partner complete, hackathon submissions | **Sat 3 Oct** | OTA | OTA | planned | – |
| [4.4.0](#440--event-feedback-and-user-iam) | minor | Event feedback system, user-level IAM | **Mon 5 Oct** | OTA | OTA | planned | – |
| [4.5.0](#450--notifications-store-build) | minor | Notification system (rich push, actions, in-app inbox, unified preferences) | **Wed 7 Oct** | **store build** | **you** | planned | – |
| [4.6.0](#460--legal-content-and-v4-sign-off) | minor | New legal docs + re-acceptance, content, tracked links, v4 polish | **Fri 9 Oct** | OTA (4.5.0 runtime) | OTA | planned | – |
| 4.x.y | patch | Urgent fixes | any day | OTA | OTA | as needed | – |
| [4.7.0](#470--web-to-mobile-parity) | minor | Web to mobile parity | after 10 Oct | – | – | planned | – |

**Sat 10 Oct: v4 sign-off.** Every item in this file is `done`, `dropped` or `moved → 4.7.0+` with a reason.

### How releases ship

| Kind | Ships as | Who | When |
|---|---|---|---|
| Patch (4.x.y) | OTA only | `npm run update:production` | any day, same-day fixes |
| Minor, JS-only | OTA | `npm run update:production` | on its train date |
| Minor with native changes | store build | **you**: `eas build --profile production --platform all` → `eas submit` | 4.5.0 only in v4 |
| Major | store build | **you** | 4.0.0 only in v4 (the next major is 5.0.0) |

**Train rules**
1. **Native freeze windows.** Between store builds, don't touch native modules, config plugins or native parts of `app.config.js`. Window A: 27 Sep → 5 Oct (4.0.0 runtime). Window B: 7 Oct → 10 Oct (4.5.0 runtime). All native work for 4.5.0 lands on 5–6 Oct only. Before every OTA, run `eas fingerprint:compare` against that runtime's build. If it differs, the change waits for the next store build.
2. **Cut scope, never the date.** Anything not QA'd by ship day is `moved →` to the next release.
3. **2-day cycle.** Day 1: build. Day 2 morning: device QA, drift check, backend/web deploy. Day 2 evening: OTA publish (or store submit).
4. **OTA before approval is fine.** It's stored against the fingerprint, and phones pick it up the first time they open the approved build.
5. **Runtime handover at 4.5.0.** 4.6.0 is published for the 4.5.0 runtime only. When 4.5.0 is live on both stores, raise the minimum version to 4.5.0 so nobody stays on the 4.0.0 runtime and misses 4.6.0.
6. **Staged OTA rollout** (from 4.1.0): publish at 20%, watch Crashlytics for 2 h, then 100%. The rollback runbook is in the OTA workstream (W3).

### Day-by-day

| Day | Date | App release | Platform workstreams |
|---|---|---|---|
| Sat | 26 Sep | 4.0.0 prep: 0.3, 0.6, 0.7, 0.9, start QA 0.4 | Decide D1–D7 below |
| Sun | **27 Sep** | **4.0.0 submitted** (you) | W1 backend review starts |
| Mon | 28 Sep | 4.1.0 build | W1 · W8 PM MVP starts · W2 EKS design + k6 scripts |
| Tue | **29 Sep** | **4.1.0 OTA** · raise min version to 4.0.0 once live | W1 · W2 baseline load test on current prod-shaped copy · W8 |
| Wed | 30 Sep | 4.2.0 build | W1 findings list · W2 EKS cluster + networking (Terraform) · W8 PM MVP |
| Thu | **1 Oct** | **4.2.0 OTA** | W1 fixes · W2 manifests/Helm + autoscaling · W6 legal drafting starts · W8 |
| Fri | 2 Oct | 4.3.0 build | W1 fixes · W2 staging on EKS · W4 notification orchestrator (backend) · W6 · W8 |
| Sat | **3 Oct** | **4.3.0 OTA** | W2 · W4 · W6 · W7 content system · **W8 PM MVP live** |
| Sun | 4 Oct | 4.4.0 build | W4 delivery logs + preferences · W6 drafts done · W7 · W9 finance |
| Mon | **5 Oct** | **4.4.0 OTA** · **native window for 4.5.0 opens** | W2 load tests on EKS staging · W6 to lawyer · W7 · W8 · W9 · W10 tracked links |
| Tue | 6 Oct | 4.5.0 native work + QA | W2 tuning · W4 · W6 lawyer review · W8 · W9 · W10 |
| Wed | **7 Oct** | **4.5.0 submitted** (you) · native freeze B | W6 lawyer review · W9 · W10 |
| Thu | 8 Oct | 4.6.0 build | **W2 2K sign-off + production cutover to EKS** · W6 final text · W7 legal docs in CMS · W10 |
| Fri | **9 Oct** | **4.6.0 OTA** · raise min version to 4.5.0 once live | W6 publish + re-acceptance on · **W8 all modules live** · all workstreams close |
| Sat | **10 Oct** | Patch day (4.6.x) | **v4 sign-off**: update this file, write 4.7.0+ backlog |

### Decisions

Decided 2026-09-26.

| # | Decision | Answer | Effect on plan |
|---|---|---|---|
| D1 | OTA reload policy | **Reload silently if the app was away 30 min+, otherwise apply on next cold start** | Implemented in `otaUpdate.ts` for the 4.0.0 build |
| D2 | Support routing | **Organiser first**: event questions go to the space inbox, organiser can escalate; Unifesto handles account/payment/app issues and sees everything | Organiser inbox is core to 4.2.0 |
| D3 | Project management system | **Build inside Apex**: MVP (tasks, projects, deadlines calendar) by 3 Oct, remaining modules by 9 Oct | W8 rescheduled 28 Sep → 9 Oct |
| D4 | Company books | **Zoho Books**; Apex syncs platform revenue monthly through its API | W9 |
| D5 | Backlink system | **Both**: our tracked short links + external backlinks from Google Search Console | W10 |
| D6 | Legal review | **Own lawyer** reviews 6–8 Oct. Company details received (see W6) | W6 |
| D7 | Scale approach | **Move to autoscaling on Kubernetes (EKS) + ALB**; prove 2K on a **temporary staging copy** of the new stack before cutting production over. Claude writes Terraform + Helm in PRs; **you run `terraform apply`** | W2 rewritten, sign-off moves to 8 Oct |

### Risks

- **EKS by 8 Oct is the tightest item.** Cluster, networking, manifests, autoscaling, secrets and observability, then a production cutover, in about 9 days. Fallback if staging isn't green by 6 Oct: keep production on the current host, scale it up vertically for 10 Oct, and cut over to EKS right after sign-off. The cutover is done at a quiet hour with DNS TTL lowered a day before, and the old host stays up for instant rollback.
- **Scope.** 14 workstreams in 14 days next to a store launch. If something has to give, cut in this order: W8 modules beyond the MVP, W9 revenue analytics, W10 external monitoring, 4.7.0 parity. Must-haves for 10 Oct: support, sponsor/partner, hackathon, feedback, notifications, 2K scale, legal.
- **Two store reviews** (27 Sep, 7 Oct). A rejection costs about a day. 4.5.0 is submitted 3 days before sign-off for that reason.
- **Legal needs a human lawyer.** Claude can draft against the DPDP Act 2023, the IT Rules 2021, the Consumer Protection (E-Commerce) Rules 2020, Razorpay and store policies, but the drafts aren't legal advice and must be reviewed before publishing.
- **Load testing prod is off-limits.** W2 runs against a staging copy only.
- **Force updates** must wait until the new build is live on both stores.

---

### 4.0.0 · Stabilize and ship

**Type:** major · **Ships as:** store build (iOS + Android) + backend deploy · **Branch:** `release/4.0.0`

Why major: first store build since the SDK 57 upgrade and the full mobile redesign. It adds OTA, and old builds must be forced to update (they still call the removed `/wallet` endpoint).

#### Plan

| # | Item | Status |
|---|---|---|
| 0.1 | Commit outstanding work, cut `release/4.0.0` | done |
| 0.2 | Add `expo-updates` (fingerprint runtime, channels, foreground check) | done (reload policy open, see below) |
| 0.3 | Drift check + deploy pending backend work (Node 22, npm audit fixes, ticket-type manage/reorder endpoints, sponsor logo, organiser cancel, migrations `user_last_seen_at` + `platform_config_stats_recipients`) | in progress: local checks pass, server drift check + deploy not run |
| 0.4 | Device QA of everything "not on device": SDK 57 + iOS 27 scene delegate, Liquid Glass, nav, Home/Tickets/Profile, Space tab, Apex tab, offline check-in, widget, App Clip, OneSignal init fix | planned |
| 0.5 | Force-update old builds: raise `minimumVersion` to 4.0.0 in the app-version config (`mobile/src/lib/appUpdate.ts` already enforces it) once 4.0.0 is live in both stores | planned |
| 0.6 | App Store reviewer demo login (email OTP only today): fixed-OTP allowlisted demo account on the server | done (already live: `test-user@unifesto.app`) |
| 0.7 | Store prep: privacy labels (camera, location, notifications), new screenshots, `GOOGLE_MAPS_ANDROID_API_KEY` in EAS env, Apple portal: `com.unifesto.app.Clip` + App Group `group.com.unifesto.app` | planned |
| 0.8 | `eas build --profile production --platform all` → `eas submit` | planned |
| 0.9 | Registration questions: 7 new types, answer limits, conditional questions, server-side answer policy, private file uploads (details below) | done locally: needs migrate deploy, S3 bucket-policy check, rebuild backend + space, ships in the 4.0.0 store build |
| 0.9a | Fix: "Checkboxes" questions rendered as a single tick on mobile (answers saved `true`, options never shown) | done |

**Cut line (27 Sep):** if not QA'd by Sunday, drop from the build rather than slip: App Clip (Apple portal setup), Up next widget. Everything else is required.

**Open decisions**
- OTA reload policy: `handleDownloadedUpdate()` in `mobile/src/lib/otaUpdate.ts` is a `TODO(user)`. Options are next launch (current no-op), prompt, or reload-now; a middle ground is to reload only if the app was backgrounded more than about 30 minutes.

**0.9 · Registration questions**

New question types (enum `FormFieldType`, migration `20260926160000_form_field_more_types`):

| Type | Organiser sees | Attendee answers with | Stored as |
|---|---|---|---|
| `YES_NO` | Yes / No tick | one tick (consent, "need accommodation?") | `true` / `false` |
| `URL` | Link | a web link | `https://…` string |
| `DATE` | Date | native date picker | `YYYY-MM-DD` |
| `FILE` | File upload | PDF / image / doc from the phone | `{ key, name, size, mime }` |
| `SECTION` | Section heading | nothing (a heading + note that splits a long form) | never stored |
| `STATE` | State / UT | pick from the 36 Indian states and UTs | the name, e.g. `Telangana` |
| `RATING` | Rating | 1 to 5 (or 1 to 10) | integer |

Every question also gets **help text** (`helpText`), **answer limits** (`config`) and an optional **show-if condition** (`showIf`).

- Limits: text min/max length · number min/max · date earliest/latest · checkboxes min/max picks · rating scale 5 or 10 · file types (PDF, image, doc) and max size (1 to 10 MB, default 5).
- Show if: "show this only when question X is one of A, B". X must be a choice question (Dropdown, Single choice, Checkboxes, Yes/No, State/UT) that comes **earlier** on the same ticket. If X is hidden, anything that depends on it is hidden too.

**Answer policy (backend is the source of truth, `registrations/form-answers.util.ts`)**
- The server checks every answer on self-registration, RSVP, checkout, waitlist, seat claim, group roster edits and curator manual add. Before this, it saved whatever the client sent.
- Required: enforced only for questions that are visible. Attendee paths enforce it. Curator manual add and a lead editing teammates check answer types but **don't** force required answers, because the person adding may not know them.
- Hidden answers (show-if false) and `SECTION` answers are dropped before saving, so exports never show stale answers.
- Keys that aren't question ids (e.g. `gender`, legacy keys) pass through untouched.
- Choice answers must be one of the options. Legacy `true` on a "Checkboxes" question is still accepted until 0.5 forces old builds to update.
- Changing a question's **type** is blocked once anyone has registered on that ticket, because old answers would stop matching. Label, options, limits and required can still change, and a removed option keeps old answers as they are.

**File policy**
- Upload: `POST /events/:id/form-fields/:fieldId/upload` (signed in, throttled). Only for a `FILE` question, and only while the event takes registrations or when the uploader can manage attendees. The server checks the file's real type against the question's allowed types, not just its name.
- Stored **privately** under `private/form-uploads/{eventId}/{fieldId}/{userId}/{uuid}.{ext}` and never exposed as a public URL. An answer's file key must be one the registering person uploaded for that question.
- Viewing: `GET /events/:id/form-uploads/url?key=` returns a signed link valid for 5 minutes, only to the uploader or someone with `event:manage-attendees` (Crew can't open files).
- Retention: a daily job deletes an event's uploaded files **180 days after it ends** and stamps `events.form_uploads_purged_at`. Unused uploads (checkout abandoned) go at the same time.
- **Deploy step:** the S3 bucket policy must not allow public `GetObject` on `private/*`. Check this before turning uploads on.

**To ship 0.9**
1. Drift check, then `migrate deploy` (`20260926160000_form_field_more_types`: additive enum values + 3 nullable columns + 1 nullable column on `events`).
2. S3: confirm the bucket policy excludes `private/*` from public reads (keys are unguessable UUIDs, but they must not be public).
3. Rebuild backend + space. Old app builds keep working: they ignore unknown types (shown as text) and legacy `true` on Checkboxes is still accepted.
4. Mobile needs the store build (new native module `expo-document-picker`), which 4.0.0 already is.
5. QA on device: every type in registration, claim, manage group and curator add; show-if hiding; required Yes/No; file upload + open from attendee detail; CSV import skips sections/files.

**Surfaces**
- Backend: schema + migration, DTO validation of `config` / `showIf`, answer validator (+ specs), upload + signed URL + purge job, exports and CSV import aware of new types (sections skipped, files by name, Yes/No).
- Space web: question editor (all types, help text, limits, show if), add-attendee form renders every type, attendee detail shows Yes/No, rating, and a "View file" link. (Apex's copy of the ticket editor isn't routed anywhere since Apex went platform-only, so it was left alone.)
- Mobile: question editor (`TicketQuestionScreen`), registration / claim / manage group / curator add render every type with show-if, limits and help text; file picking via `expo-document-picker` (**native module → store build**, fits 4.0.0).

#### Release checklist (4.0.0)

Owner: **C** = Claude, **Y** = you. Gate = what must be true before the next row.

**A. Code ready**
- [x] C · Untracked native/widget sources committed (`modules/clip-handoff/ios`, `src/widgets/{ios,android}`) and `.gitignore` narrowed to `/ios/` `/android/`
- [x] C · CI status checks added and green on GitHub (backend tsc + tests + migration scan, mobile tsc + clean-checkout Android/iOS bundle, web/space/apex tsc)
- [ ] Y · Turn on branch protection for `main`: require the **CI passed** check (Settings → Branches)
- [x] C · 0.9 registration questions verified (backend 269/269, tsc everywhere) and committed · [#6](https://github.com/unifesto-app/unifesto/pull/6); merge after #5
- [x] C · Expo patch bumps (10 packages) · in #6, Android + iOS bundles pass
- [ ] C · `release/4.0.0` rebased on `main`; `npx expo-doctor` clean

**B. Backend ready**
- [x] Y · S3 bucket policy: deny anonymous `GetObject` on `private/*` (applied 26 Sep; anonymous read of a `private/` test object returns 403)
- [x] C · Drift check, then `./deploy.sh backend space` (migration `20260926160000_form_field_more_types` applied, 104 migrations)
- [x] C · Reviewer demo login (0.6): already live (`test-user@unifesto.app`, code in App Review notes). W1 follow-up: move the code to env, stop logging received OTPs
- [x] C · Smoke test after deploy: 3 backend replicas healthy, `/health` all green (db, redis, storage), space 200, upload route live (401 anonymous). Registration with new question types = device QA (D)

**C. Store setup**
- [x] Y · Apple portal: App Clip ID + App Group created. Prebuild verified 4 signed targets: `com.unifesto.app` (groups `group.com.unifesto.app` + `.onesignal`, appclip link), `.Clip` (parent app, appclips domains, group), `.widgets` (group), `.OneSignalNotificationServiceExtension` (group `.onesignal`)
- [x] Y · Play: service-account key for `eas submit` at `mobile/google-play-service-account.json` (gitignored), `play-console-analytics@` granted Release to production + testing tracks
- [x] C · EAS production env checked: API URL, Cognito, Google IDs, OneSignal, Maps key, `GOOGLE_SERVICES_JSON` present
- [x] Y · App Store privacy labels published (answers in `docs/store/4.0.0.md`)
- [ ] Y · Play Data safety form, same data types as above
- [x] Y · App Store listing done: description, keywords, What's New, Promotional Text, review sign-in + notes, iPhone 6.9" + iPad 13" screenshots
- [ ] Y · Play listing: Data safety, descriptions, phone screenshots
- [x] C · Store copy in `docs/store/4.0.0.md`: What's New, description, keywords, review notes, privacy + data safety (#9)
- [x] C · iOS permission prompts made accurate, placeholder prompts removed; paid online sessions hidden from iOS checkout (3.1.1) (#9)

**D. Device QA (0.4)**, one iPhone (iOS 26+) + one Android
- [ ] Y · Login (email OTP, Google), logout, offline session restore
- [ ] Y · Home, event detail (map), register free + paid (Razorpay test), ticket + QR, group invite/claim
- [ ] Y · Registration questions: every new type, show-if, file upload
- [ ] Y · Space tab: manage event, tickets, attendees, check-in scanner (online + offline queue)
- [ ] Y · Apex tab (admin), judging, sponsor booth scan
- [ ] Y · Push arrives (OneSignal external id linked), deep links open the right screen
- [ ] Y · Widget shows "Up next"; App Clip opens an event (or cut)
- [ ] Y · Light/dark, small phone, iPad layout

**Cut line (decide by 27 Sep noon):** if App Clip or widget fails QA or the Apple portal isn't ready, remove its plugin from `app.config.js` and move it to 4.5.0.

**E. Build + submit (you)**
- [ ] Y · `eas build --profile production --platform all`
- [ ] Y · Install the production builds via TestFlight / internal testing; 10-minute smoke of section D
- [ ] Y · `eas submit --profile production --platform all`
- [ ] C · Record build numbers + runtime fingerprint under Shipped; publish nothing OTA until the fingerprint is recorded

**F. After approval**
- [ ] C · Raise minimum version to 4.0.0 when live on **both** stores (0.5)
- [ ] C · First OTA (4.1.0) at 20% rollout, check Crashlytics, then 100%

#### Log

- **2026-09-26** · Release plan written.
- **2026-09-26** · Ticket management (hidden tiers, reorder, sale window, questions, restrictions), Up next widget, iOS App Clip, Home workspace panels, ImageCropper · [#2](https://github.com/unifesto-app/unifesto/pull/2) (merged)
- **2026-09-26** · `release/4.0.0` cut.
- **2026-09-26** · EAS Update with fingerprint runtime, `update:*` scripts, foreground check · `e004c5d` · [#3](https://github.com/unifesto-app/unifesto/pull/3) (merged)
- **2026-09-26** · Fixed config-validation spec (missing Razorpay env in fixture); backend 251/251 tests pass · `e830e00` · #3
- **2026-09-26** · 0.3 drift check blocked (SSH to prod needs permission); new migrations reviewed, both additive.
- **2026-09-26** · 0.9a Checkboxes fix on mobile (`CHECKBOX` with options → multi-select). 0.9 planned: new question types + answer/file policy.
- **2026-09-26** · Backend + space deployed with 0.9 (registration questions) after the S3 `private/*` deny rule; migration `20260926160000` applied. 4.0.0 server side complete · [#7](https://github.com/unifesto-app/unifesto/pull/7)
- **2026-09-26** · Found untracked build-breaking files (clip-handoff native module, widget sources) hidden by a bare `ios/` gitignore; fixed. Added CI status checks + release checklist.
- **2026-09-26** · Decisions D1–D7 made (see Decisions). Scale moves to EKS; PM system built in Apex; books in Zoho Books.
- **2026-09-26** · v4 scope set for 10 Oct: 7 releases (2 store builds: 4.0.0, 4.5.0) + workstreams W1–W10.
- **2026-09-26** · Release train set: 4.0.0 on 27 Sep (store), 4.1.0 on 29 Sep (OTA), 4.2.0 on 1 Oct (OTA). Native freeze after 4.0.0 submit.
- **2026-09-26** · 0.9 built (not committed): backend answer validator + policy on all 6 save paths, question-definition checks, type-lock after registrations, private uploads + 5-min view links + 180-day purge job, exports/CSV aware; space editor + inputs + file links; mobile editor + all inputs (date picker, state sheet, rating, file picker) + show-if everywhere. Backend 269/269 tests (18 new), tsc clean in backend/space/mobile, iOS bundle exports. Not yet seen on device or in a browser.

#### Shipped

- iOS build: 36 (`1e0affa`), submitted 26 Sep · runtime `e197ffbecf4be9ed7002503f074c1cdf1220328c`
- Android build: 45 (`e21ff68`), submitted 26 Sep · runtime `54e9557aa67944c2f844221ecb9f2227fd2ccf81`
- Backend deploy: 2026-09-26 18:00 IST (backend + space, 0.9)
- OTA update: none reached this runtime. The 1 Oct update (groups `8e408eea` / `83309ce3`) was published to the unbuilt 4.0.5 fingerprint, see 4.0.5 log

---

### 4.0.5 · Fix what failed in 4.0.0

**Type:** patch · **Ships as:** store build only (iOS + Android), no OTA · **Branch:** `claude/repository-fixes-cd9ed8` ([#14](https://github.com/unifesto-app/unifesto/pull/14))

Collects every failure from the 4.0.0 build, upload, device QA and App Review, and ships the fixes as one new binary. Store build (not OTA) because some fixes touch native config, and a new binary is the only thing that reaches people who hit the failure on 4.0.0's first launch.

**Runtime note:** 4.0.5 has its own fingerprint. OTAs from 4.1.0 onward must target the 4.0.5 runtime, so native freeze window A starts at 4.0.5 submit instead of 4.0.0, and force-update (0.5) moves to minimum 4.0.5.

#### Plan

| # | Item | Status |
|---|---|---|
| 5.1 | EAS builds 43/44/33/34 errored at "Configure expo-updates": local fingerprint ≠ EAS (node_modules files rewritten by local prebuild). Fixed with `mobile/fingerprint.config.js` | done in 4.0.0 · [#12](https://github.com/unifesto-app/unifesto/pull/12) |
| 5.2 | iOS build 35 rejected on upload, ITMS-90683 (missing `NSMotionUsageDescription`, also Location Always + Face ID). Keys restored with honest text; build 36 uploaded | done in 4.0.0 · [#13](https://github.com/unifesto-app/unifesto/pull/13) |
| 5.3 | Device QA failures from 4.0.0 (26 Sep), itemised below as 5.3a–5.3w | done (5.3f web part moved → W10) |
| 5.4 | App Review / Play review findings on 4.0.0 | done 2 Oct: none. iOS 36 and Android 45 both approved, no rejections or policy warnings |
| 5.5 | Bump `version` to 4.0.5 in `mobile/app.config.js` + `mobile/package.json` | done |
| 5.6 | Pre-build: grep linked iOS APIs vs purpose strings; `npx expo-doctor`; clean-checkout fingerprint matches EAS | done 2 Oct: merged Info.plist has every key for linked modules (camera, mic, photos, location incl. Always, motion, Face ID, local network, notifications); expo-doctor 21/21 after 9 SDK 57 patch bumps; clean `npm ci` checkout = local fingerprint (iOS `d1776dd1…`, Android `d379e9cc…`); tsc + iOS/Android bundle export green |
| 5.7 | `eas build --profile production --platform all` → `eas submit` | planned |

**5.3 · Issues found on 4.0.0 builds (iOS 36, Android 45)**

Layer: **B** backend (deploy.sh, reaches 4.0.0 too) · **M** mobile JS · **N** mobile native (store build only) · **W** web/space · **A** apex · **Y** you (console/config).

| # | Issue | Root cause (found in code) | Fix | Layer | Status |
|---|---|---|---|---|---|
| 5.3a | Check-in: search shows only the team lead | `searchRegistrations` returns one row per registration with `attendee = lead`, even when a teammate matched; tapping it checks the whole registration in | Return one row per group member (seat) with `memberIndex`; member rows check in through `/checkin/group` for that one member | B + M | done |
| 5.3b | Check-in: duplicate check-ins | Manual check-in of a group writes only the registration-level record, so the QR scan roster still shows every member as not in and they get checked in again; scan + manual race on the same person | Group results never use the whole-registration path (5.3a); treat the unique-key race as "already checked in" instead of an error | B + M | done |
| 5.3c | Check-in: checked-in people missing from Recents | Recents read `GET /checkin/event/:id`, a Redis snapshot cached 1 h and **never invalidated on check-in**; group members aren't listed at all | New fresh `GET /checkin/event/:id/recent` (individual + member check-ins, per point); invalidate the snapshot on every check-in write | B + M | done |
| 5.3d | Group member doesn't get the WhatsApp "Join group" card on their ticket | `getRegistrationWhatsappGroup` only allows the registration owner (lead); a claimed-seat member gets 403 | Allow the seat's claimer; per-seat joined state (`group_seats.whatsapp_joined_at`) | B (+migration) | done |
| 5.3e | Registration: a field type doesn't work on mobile | Type mapping + inputs look right in code; need the exact type/screen | Reproduce, then fix | M | done for Dropdown (rendered as a plain option list, now a picker sheet); confirm on device that Dropdown was the broken type |
| 5.3f | Space UTM tracking not working | Web space page opens the app with a bare `unifesto://space/…` (no `withStoredUtm`), so web-landed space campaigns are lost | Carry UTM through the space deep link (and every event link on the space page) | W | moved → web: mobile + backend only for now; fix kept on `backup/4.0.5-old-session` |
| 5.3g | Views + UTM source not tracked (only registrations are) | There is no view tracking at all: only `EventRegistration.utm*` exists | Page-view ingest (event + space, web + app) with source/medium/campaign, deduped per visitor per day | B (+migration) + W + M | done (app + backend; web views dropped: mobile + backend only) |
| 5.3h | Page analytics for Space and Event | Doesn't exist | Views, unique visitors, sources, view→registration conversion; Space web + mobile Space tab | B + W + M | done in the mobile app (event + space Tracking, Apex › Traffic); no Space web |
| 5.3i | Short links for tracking links | Doesn't exist | `ShortLink` (code → event/space + utm), redirect route on `unifesto.app/l/:code`, click counts; UTM link builder + partner links create short links | B (+migration) + W + M | done on `api.unifesto.app/l/:code`; `unifesto.app/l/*` host, AASA `/l/*` and web builder moved → W10 |
| 5.3j | Home "Happening near you" scroll isn't smooth | – | Rework the rail (snap + deceleration, memoised items, image sizing) | M | done |
| 5.3k | Missing banner/logo shows a blue block | Fallback is a flat colour | Platform default image library (banners 4:3, logos 1:1) managed in a new Apex screen; apps pick one deterministically per event/space | B + A + W + M | done in the app + backend: Apex › Default images; web and Space web not changed (mobile + backend only) |
| 5.3l | Stack header needs a blurred background | Header is fully transparent | `expo-blur` (already installed) behind the shared stack header | M | done |
| 5.3m | Push notifications: delete | No delete exists | Delete broadcasts from Apex push history (decided: Apex history, not the user inbox) | B + M | done |
| 5.3n | Apex mobile Status page should use UptimeRobot | Status reads our own `/health` only | Backend proxies UptimeRobot API (monitors, uptime %, incidents); key in env | B + M + Y | done: Apex › Status "External monitoring"; needs UPTIMEROBOT_API_KEY (read-only) in backend .env |
| 5.3o | Widgets show no data; more widgets wanted | Up next is fed only from the Home tab (`useHomeData` → `syncUpNextWidget`); needs a device check of the App Group / Android task handler | Debug on device, then add widgets | N | done in code: widgets refresh on sign-in, foreground and ticket changes (not only from Home), live events no longer drop off, new "Countdown" widget (iOS + Android). Device check of the iOS App Group still needed |
| 5.3p | Android: event location shows an empty grid | Google Maps grid = key rejected. Key is set in EAS, so most likely the key's Android restriction lacks the **Play app-signing SHA-1** (Play re-signs builds) | Add the Play app-signing SHA-1 + `com.unifesto.app` to the key in Google Cloud; confirm Maps SDK for Android is enabled | Y | done 2 Oct: Play app-signing SHA-1 + `com.unifesto.app` added to the Maps key, Maps SDK for Android enabled; map confirmed on a Play-installed 4.0.0 Android build (no build needed) |
| 5.3q | Push device "Link failed: 404 Target user does not exist" in Apex | Transfer to an external id with no OneSignal user yet (new account, device never ran `login()`) | Create the OneSignal user, retry the transfer once | B | done |
| 5.3r | "App version: Not reported yet" after social sign-up | Report fired while only a temp token existed, never retried until a cold start | Wait for the access token; retry on foreground resume (24h gate kept) | M | done |
| 5.3s | Pull-to-refresh on event, space and ticket detail | – | Refresh control on the three detail screens | M | done |
| 5.3t | New: replace a team member | – | Curators turn on "Allow team changes" (Event settings › Attendees); the lead then replaces a filled member seat (invite someone else or free it). Curators can always replace from Attendees. Old ticket deleted, both told by email; not the lead's seat or a checked-in member | B (+migration) + M | done |
| 5.3u | New: allow / stop attendees editing their details | – | Event settings › Attendees: switch + optional "Edits close" deadline. Solo edits their answers, lead the team's + own, member their own; curators edit anyone any time (Attendees › Edit details) | B (+migration) + M | done |
| 5.3v | New: OTA system complete (W3) | – | Preflight vs recorded store fingerprints, 20% staged rollout, promote / revert / rollback scripts, runbook, Profile › About, build info on Crashlytics and support tickets, in-app What's new | B (+migration) + M | done |
| 5.3w | Home "Up next" shows completed tickets; no way to delete finished tickets | Up next kept a ticket until its scheduled end and never saw the event status (not sent), so an event marked Completed/Cancelled stayed; it also scanned only the 5 newest registrations | Send event status; Up next and Tickets drop completed/cancelled events; scan 20 registrations. Delete a finished ticket from my list (long-press in Tickets, or the ticket's menu): hides it for me only, registration kept | B (+migration) + M | done |

**Traffic and short links (5.3g–i) in detail**

- Backend: `page_views`, `short_links`, `short_link_clicks` (migration `20260929121000_traffic`, additive). `POST /traffic/views` (anonymous install id, consent-gated in the app, 30-min dedupe); `events/:id/traffic`, `spaces/:id/traffic`, `admin/traffic`; short links for events (`event:edit`), spaces (`space:manage-settings`) and any unifesto.app page (`platform:manage`), redirect at `/l/:code` with `utm_medium=short_link&utm_campaign=<code>` so registrations credit through the existing utm capture.
- Config (optional, defaults shown): `SHORT_LINK_BASE_URL=https://api.unifesto.app`, `TRAFFIC_HASH_SECRET` (falls back to `JWT_SECRET`).
- Privacy: views carry a random per-install id, no account id; clicks store an HMAC of IP + user agent, never the IP. Both fit the published labels (Product Interaction, not linked, analytics, consent-gated).

**Migrations in this release** (all additive; run by `./deploy.sh backend` before the API restarts): `20260927100000_group_seat_whatsapp_joined`, `20260929121000_traffic`, `20260929130000_event_attendee_controls`, `20260929140000_support_ticket_client_info`, `20260929150000_default_images`, `20260930120000_hidden_tickets`.

**New backend env (optional):** `UPTIMEROBOT_API_KEY` (read-only key, for Apex › Status), `SHORT_LINK_BASE_URL`, `TRAFFIC_HASH_SECRET`.

**After the store build is live:** `npm run ota:record` in `mobile/` and commit `runtime-fingerprints.json`, or no OTA for 4.0.5 can pass the preflight.

#### Release checklist (4.0.5)

- [ ] C · Every 5.3/5.4 item fixed on the release branch (base `main`), tsc + bundles green in CI
- [x] C · Version bumped, pre-build checks (5.6) pass
- [x] Y · `eas build --profile production --platform all`, TestFlight / internal testing smoke of the failed items + section D
- [x] Y · `eas submit --profile production --platform all`
- [x] C · Record build numbers + fingerprint under Shipped; 4.1.0 OTA targets this runtime

#### Log

- **2026-09-26** · 4.0.5 planned: store build that fixes what failed in 4.0.0. Build-pipeline failures (5.1, 5.2) already fixed before 4.0.0 shipped.
- **2026-09-26** · 5.3a–d check-in per member, recents, WhatsApp card for members (+ migration); 5.3s pull-to-refresh; 5.3j/l header blur + rail. Committed on the other machine; recovered from `backup/4.0.5-old-session` and cherry-picked
- **2026-09-29** · Work lost when the other machine ran out of credits, rebuilt: backend traffic module + tests (verified against a local Postgres copy of the schema), mobile beacon / Tracking traffic / Short links / Apex Traffic, 5.3q OneSignal link, 5.3r app version, rail end-snap fix, version 4.0.5 · PR [#14](https://github.com/unifesto-app/unifesto/pull/14)
- **2026-09-29** · 5.3l header backdrop redone after QA ("can't see it on many screens"): drawn by the app on both platforms (real blur on iOS, raised tint on Android instead of a page-colour wash) with a bottom hairline
- **2026-09-29** · 5.3t team member replacement, 5.3u attendee detail edits (verified against a local Postgres copy), 5.3v OTA system, 5.3k default images, 5.3m push history delete, 5.3n UptimeRobot, 5.3o widgets + Countdown
- **2026-09-30** · 5.3w Up next no longer shows completed tickets; finished tickets can be deleted from my list (+ migration)
- **2026-10-01** · 5.3u follow-up: detail edits moved into Manage group (lead: team answers; teammates can now open it for their own answers); name/email/phone/gender read-only with a pointer to Profile; lead's roster save now honours the organiser's edit switch + deadline (was only blocked on COMPLETED)
- **2026-10-02** · Verified on EAS: **no 4.0.5 build exists yet**; the newest production builds are 4.0.0 (iOS 36, Android 45). The "4.0.5 runtimes" recorded on 1 Oct (`1ab016e`) came from `ota:record` on the local tree (`dab32dd9…` iOS / `e336981a…` Android), so the 1 Oct OTA (Hackathon help desk + Apex OTA updates, groups `8e408eea` / `83309ce3`) targets a runtime no installed app has and reached nobody, and `ota:preflight` was passing falsely. `runtime-fingerprints.json` reset to the live 4.0.0 fingerprints; preflight now correctly fails until the 4.0.5 store build ships. All pre-build items closed

- **2026-10-02** · 5.4 closed: 4.0.0 approved on both stores (iOS 36, Android 45), no review findings
- **2026-10-02** · 5.3p fixed in the console: Android maps load on the live 4.0.0 build
- **2026-10-02** · 5.6 pre-build checks pass (see table). `expo install --fix` bumped 9 SDK 57 patches (expo, expo-updates, expo-router, expo-camera, expo-widgets, …), so the 4.0.5 fingerprint is now iOS `d1776dd1…` / Android `d379e9cc…`. Ready to build
- **2026-10-03** · 4.0.5 live on both stores (iOS 39 / Android 46, EAS production builds of 2 Oct). Fingerprints read from EAS (not the local tree) match the 2 Oct record and are now first in `runtime-fingerprints.json`; 4.0.0 kept for users not yet updated. OTAs from 4.1.0 on target this runtime; force-update to minimum 4.0.5 is unblocked

#### Shipped

- iOS build: 39, built 2 Oct, live 3 Oct · runtime `d1776dd1e847165bdd66cfddd6165c836578319d`
- Android build: 46, built 2 Oct, live 3 Oct · runtime `d379e9cc368ba7d4f39257b5aa89cfeddbb7f95b`
- Runtime fingerprints: recorded from EAS build metadata into `runtime-fingerprints.json` (3 Oct)

---

### 4.1.0 · Hackathon event day

**Type:** minor · **Target:** Tue 29 Sep · **Ships as:** OTA (4.0.5 runtime) + backend/web/space deploy

Already built: backend (rounds, panels, judgments, awards), space curator console (7 tabs), mobile judge/mentor scoring, mobile participant view + push. The `hack` app has been removed.

#### Plan

| Item | Status |
|---|---|
| Mobile curator console for event day: open/close rounds, advance/eliminate, judging progress tracker, publish awards (setup stays on web) | planned |
| Public web winners / bracket page (hackathon plan phase 5) | planned |
| OTA: 20% staged rollout for this release (reload policy already in 4.0.0) | planned |
| Sponsor/partner quick win: fix curators seeing Sponsors nav on web but getting 403 | planned (from 4.3.0) |
| Sponsor/partner quick win: mobile `partnering` section in `spaceSections.ts` (partners find their stats in the Space tab) | planned (from 4.3.0) |
| Force-update old builds (4.0.0 step 0.5), once 4.0.0 is live in both stores | planned |
| Project submissions (repo, demo, deck) for entrants | moved → 4.3.0 |
| Hackathon mobile section, Phase 1 of [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md): hackathon mode on/off, group registrations imported as teams with curator Team IDs, venue + rooms (auto-allocate), team hub for every member, push + in-app notification feed. Needs migration `20260930120000_hackathon_foundation`; no new native modules (OTA-safe) | done (not deployed) |
| Hackathon mobile section, Phase 2 of [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md): themes and problem statements (codes, max teams), three modes (teams write / teams pick / curator assigns), optional deadline with a 1-hour reminder, lead locks it in once, curator assigns/changes/reopens, "changed after evaluation" flag, judging only for teams with a locked statement. Needs migration `20260930130000_hackathon_statements`; no new native modules (OTA-safe) | done (not deployed) |
| Hackathon mobile section, Phase 3 of [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md): judges added by phone or email (themes, room or call link, rounds, breaks), panels, round settings (one judge / panel / several judges, slot and grace times, elimination, end time), criteria, open/pause/close with the undecided-teams gate, live evaluation queue (teams pick a judge, judge calls next, starts the slot, no-show after grace), 5-minute edit lock with curator reopen, live queue monitor (remove, move, finish a slot, pause a judge), team evaluate screen, judge console, realtime over the existing socket. Needs migration `20260930140000_hackathon_judging`; no new native modules (`socket.io-client` was already a dependency; OTA-safe) | done (not deployed) |
| Hackathon mobile section, Phase 4 of [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md): only submitted marks count, "final round decides" or "add up rounds" scoring, curator results (overall + per round, every judge's marks and notes, PS-changed flag), "top N" advance helper, results CSV, awards with notes declared and published by Curator / Space Admin only (new `event:declare-hackathon-winners` capability), "You won" / "Winners announced" notices, team results with winners and notes, share judges' notes. Needs migration `20260930150000_hackathon_results` (also seeds the capability); no new native modules (OTA-safe) | done (not deployed) |
| Hackathon mobile section, Phase 5 of [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md): mentors and mentoring rounds (book a session, written feedback only, N sessions with different mentors), project links per round (repo / demo / deck, optional cut-off; judges and mentors see them while evaluating), curator announcements to everyone / teams / judges and mentors / one room (push + in-app, with history). Needs migration `20260930160000_hackathon_mentors_links_announcements`; no new native modules (OTA-safe). Device run-through of the whole hackathon still to do | done (not deployed) |
| Hackathon mobile section, Phase 6 of [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md): participant and winner certificates from the app (existing templates; `{teamName}` / `{teamCode}` / `{awardTitle}` placeholders in custom text; one winners run per award; Curator / Space Admin only), and the Space web leaderboard page removed (mobile is the only curator tool), with the backend's unused legacy `/leaderboard/judges` routes. Needs migration `20260930170000_hackathon_certificates` and a Space web rebuild; no new native modules (OTA-safe) | done (not deployed) |
| Home "My hackathon" card: team, live countdown, elapsed-time bar and the team's next step, tinted with the event banner colour (new `useBannerAccent`); opens the team hub. JS-only (OTA-safe) | done (not deployed) |
| Unifesto Stay photo gallery: up to 12 photos per stay on top of the cover (team adds/removes them in the stay editor; attendees swipe through cover + gallery). Needs migration `20261003120000_stay_gallery`; no new native modules (OTA-safe) | done (not deployed) |
| Mobile Attendees list: numbered pages (30 per page, "31–60 of 245", Previous / Next, Page n of N) instead of loading more on scroll. JS-only (OTA-safe) | done (not deployed) |
| Hackathon help desk: curators put event-team volunteers in rooms and set help topics (Food, Wi-Fi…) with points of contact; teams raise queries from the hub (topic or Other); a query goes to the topic's POCs + the room's volunteers (Other → Curators/Co-Curators, falling back to curators if nobody), who pick it up ("I'm on it") and resolve it from a help-desk inbox (curator dashboard, crew check-in screen, push); the team is told at each step. Needs migration `20261001120000_hackathon_help_desk`; no new native modules (OTA-safe) | done (not deployed) |
| Auth tokens readable while the phone is locked (Keychain `AFTER_FIRST_UNLOCK`, moved to `_v2` keys with carry-over on first read): fixes background / widget / locked-reload requests going out signed-out. JS-only (OTA-safe) | done (not deployed) |
| Group team changes, lead side (mobile Manage group): a window the organiser sets (Event settings › Allow team changes + new "Lock teams at a set time"; also closes once a hackathon team has submitted); remove any seat but the lead's (team shrinks, seat back on sale, no refund, later seats renumbered with their check-in/certificate indexes); add seats (free tickets straight away, PER_PERSON paid tickets as their own Razorpay payment, settled by verify or webhook, refunded in full if they no longer fit); hand over the lead (request → member accepts; old lead becomes a member with their own ticket). Push + email for each step. Needs migration `20261003130000_team_changes`; no new native modules (OTA-safe) | done (not deployed) |
| Group team changes, curator side: remove / add seat / make lead on mobile Attendee detail (one "Manage seat" menu) and the Space web attendee page. Curators aren't bound by the window; added seats are free (collect money outside the app) | done (not deployed) |
| Money for extra seats: counted in payouts and financials (only purchases that added seats), reconciliation (new `SEATS` source; never offered as an orphan to attach), and refunds (a group refund draws on the group's payment, then each extra-seats payment, each refunded on its own Razorpay payment; other payers are emailed) | done (not deployed) |

#### Log

- **3 Oct:** Group team changes built (window + hackathon lock, remove, add free/paid, lead handover; curator tools on mobile + Space web; extra-seat money in payouts, reconciliation and refunds). Backend + mobile `tsc` clean; 92 tests green across registrations, check-in, refunds, payouts, reconciliation (new `team-changes.spec.ts`). Not run against a database or on a device yet.
- **3 Oct:** Backend + Space deployed with team changes and the Stay gallery (migrations `20261003120000_stay_gallery`, `20261003130000_team_changes`); healthy. The mobile side of both waits for the 4.1.0 OTA. Mobile Attendees switched to numbered pages.
- **3 Oct:** Manage group: seat actions moved off the rows and inside each seat's page. Tapping a person opens their page with an Actions list (Make team lead, Give the seat to someone else, Free the seat, Remove from team); an open / invited / released seat opens a seat page (Invite, Revoke, Release, Reopen, Remove). JS-only.
- **30 Sep:** Hackathon Phase 1 built (backend + mobile). Additive migration verified on Postgres with zero drift; 50-step end-to-end run and 22 HTTP checks against a local database; iOS bundle exports. Not deployed yet.
- **30 Sep:** Hackathon Phase 2 built (backend + mobile). Additive migration verified on Postgres with zero drift; 50-step run of the real services against a local database (including two teams racing for a statement's last place); iOS bundle exports. Not deployed yet.
- **3 Oct:** Unifesto Stay photo gallery built (backend + mobile, `tsc` clean). Not deployed. PR #33.
- **30 Sep:** Hackathon Phase 3 built (backend + mobile). Additive migration verified on Postgres with zero drift; 71-step run of the real services against a local database (queue, call next, no-show grace, 5-minute lock + reopen, move, time's up tick, undecided-teams gate, MULTI distinct judges, PANEL completion, cancellation); 124 leaderboard/notification unit tests pass; backend and mobile `tsc` clean; iOS bundle exports. Not deployed yet.
- **30 Sep:** Hackathon Phase 4 built (backend + mobile). Additive migration verified on Postgres with zero drift (capability seeded globally and for a space with a customised Curator role); 38-step run of the real services against a local database (drafts ignored, weighted totals, PER_ROUND vs CUMULATIVE, rounds that don't count, top N with ties, PS-changed flag, CSV incl. formula neutralising, Co-Curator can't declare winners, publish notices, award notes on the team view, feedback sharing); leaderboard, notification and auth unit tests pass; backend and mobile `tsc` clean; iOS bundle exports. Not deployed yet.
- **30 Sep:** Hackathon Phase 5 built (backend + mobile). Additive migration verified on Postgres with zero drift; 37-step run of the real services against a local database (mentors + mentoring rounds, mentor console, feedback-only sessions, distinct mentors, judges refused in mentoring rounds, project links incl. cut-off and non-web links, links shown to mentors and in results/CSV, announcements to each audience incl. rooms, empty rooms and permissions); 206 leaderboard, notification and auth unit tests pass; backend and mobile `tsc` clean; iOS bundle exports. Not deployed; not yet run through on a device.
- **1 Oct:** Hackathon Phase 6 built (backend + mobile, Space web leaderboard removed). Additive migration verified on Postgres with zero drift; 18-step run of the real certificates service against a local database (render/storage/email stubbed): participants per claimed seat with team placeholders, cancelled teams left out, re-runs skip, one winners batch per award with `{awardTitle}`, revoked winner certificate reactivated for the same award, Co-Curator refused, blank placeholders on non-hackathon events; 210 leaderboard, notification and auth unit tests pass; backend, mobile and Space `tsc` clean; iOS bundle exports. Not deployed; not yet run through on a device.
- **1 Oct:** Home Hackathon card + Keychain token accessibility fix (mobile, JS-only). Mobile `tsc` clean for the touched files; not yet seen on a device.
- **1 Oct:** Hackathon help desk built (backend + mobile). Migration applied on top of main's schema on a local Postgres with zero drift; routing rules unit-tested (148 leaderboard tests pass); backend and mobile `tsc` clean. Not deployed; not yet run through on a device.

- **4 Oct:** 4.1.0 OTA published to production at 20% from `main` `4e6b026` (preflight passed on both 4.0.5 runtimes; bundled with the `--skip-bundler` recipe). Carries everything above plus the 4.1.0 "What's new" (#37). Team changes were also run against a local Postgres before merge (6 end-to-end cases, see #34). Promote to 100% after ~2 h with clean Crashlytics.

#### Shipped

- OTA (4.0.5 runtime), published 4 Oct at 20%:
  - iOS: group `6bf9a804-d8e6-4b4d-8bf2-b6da08e40808`, update `01a1033e-ff49-75d1-b308-3a25504b51d5`, runtime `d1776dd1e847165bdd66cfddd6165c836578319d`
  - Android: group `78402f35-dd30-49f4-b951-9b33fbb733ce`, update `01a1033e-ff49-7ae1-9572-7f7389ae3e43`, runtime `d379e9cc368ba7d4f39257b5aa89cfeddbb7f95b`
- Backend + Space deploy: 3 Oct 16:32 UTC (team changes, Stay gallery; migrations `20261003120000_stay_gallery`, `20261003130000_team_changes`)
- Rollout to 100%: 4 Oct ~07:30 UTC. Starting the 4.1.1 rollout ended this one's 20% stage and made it the base update, so everyone not in 4.1.1's 20% gets 4.1.0. It had been at 20% for ~12 h; Crashlytics not re-checked at that point.
---

### 4.1.1 · Smoother event creation

**Type:** minor, published as 4.1.1 · **Ships as:** OTA (4.0.5 runtime) + backend deploy

Why: creating an event on mobile was one long form, buried four taps deep, that lost everything if you left and took ~8 taps from "done" to live.

**Version note:** this adds features, so by the version rules it is a minor release. 4.2.0 was already taken by the Support release, so it went out as 4.1.1.

#### Plan

| Item | Status |
|---|---|
| Create in three steps (Basics / When & where / Tickets), Next checks only the current step, tap back to reached steps; edit stays one page | done |
| Autosave the create form per space (AsyncStorage), "Picked up where I left off · Start over", cleared once the event exists | done |
| Inline field errors (`validateEventDraft` returns field + message; jumps to the step with the problem) | done |
| Pin on map: shared `geocodeVenue` (from `VenueMap`) + map preview; quiet 4 s attempt at save; Android asks for location only on tap | done |
| Tags as chips (`TagsField`) | done |
| "Save as draft / Publish now" at the end (default draft); publish waits for the first ticket | done |
| Cover / ticket / publish follow-ups retryable (Retry / Skip) before opening the event | done |
| "New event" on Home and the Space tab, Space Admins only (`adminSpaces()`); fixes Curators being sent to a form they can't submit | done |
| Multiple categories per event (max 3, primary first): `Event.categories` + migration `20261004120000_event_categories` (backfill + GIN index); `category` kept as the primary; single-category clients only swap the primary (`resolveCategories`); listing filter matches any; category counts unnest the list (and skip soft-deleted events) | done |
| "What's new" entry for 4.1.1 | dropped (would need its own PR; changes are mostly organiser-side) |
| Space web multi-select categories | planned |
| Show every category on event detail (mobile + web) | planned |
| Device run-through of the create flow (all steps, leave and return, Pin on map, Publish now) | planned |

#### Log

- **4 Oct:** Create flow + multiple categories built (#39). Backend `tsc` clean, 74 events/registrations/categories tests pass (new `event-categories.spec.ts`); migration applied on top of main's schema on a local Postgres with zero drift; mobile `tsc` clean + `eventDraft.check.ts` self-check. Not seen on a device.
- **4 Oct:** Backend with `categories` confirmed live in production (API returns backfilled `categories`) before publishing the OTA, since the backend rejects unknown fields.
- **4 Oct:** 4.1.1 OTA published to production at 20% from `main` `e87540f` (preflight passed on both 4.0.5 runtimes; `--skip-bundler` recipe). Publishing it promoted 4.1.0 to the base (see 4.1.0 Shipped). Promote to 100% after ~2 h with clean Crashlytics.

#### Shipped

- OTA (4.0.5 runtime), published 4 Oct ~07:30 UTC at 20%:
  - iOS: group `cb4ee139-14c3-4c9a-9f5a-b982c353fee7`, update `01a105d3-d237-7119-9d8a-8873eabbd1da`, runtime `d1776dd1e847165bdd66cfddd6165c836578319d`
  - Android: group `16c13122-5047-4e30-9e0a-bff85302b4ef`, update `01a105d3-d237-77b4-a8cf-dcd5c3cd8e0d`, runtime `d379e9cc368ba7d4f39257b5aa89cfeddbb7f95b`
- Backend (migration `20261004120000_event_categories`): live by 4 Oct ~07:20 UTC (verified through the API; deploy time not recorded here)
- Rollout to 100%: pending
---

### 4.1.2 · Typed-in teammates can join

**Type:** patch · **Ships as:** backend deploy **first**, then OTA (4.0.5 runtime, JS-only) · **Branch:** `claude/typed-teammate-invite`

Why: in hackathon teams, members the lead typed in showed "Not joined yet" while Manage group showed every seat as claimed. A typed-in teammate sits on a `CLAIMED` seat with no account (so door check-in works), the hackathon only counts seats with an account, and they had no way to link one (invites only took `OPEN` seats, a claim refused `CLAIMED`). Mid-hackathon the team-change lock also blocked remove + re-invite.

#### Plan

| Item | Status |
|---|---|
| Backend: `invite()` targets a typed-in seat by number (stays `CLAIMED`, gains `inviteEmail`); `claim`/`getClaimInfo` accept it under the same one-winner guard + email-ownership check, keeping the lead's typed details under the member's; Home invites card lists it; `decline` only cancels the link | done (#42) |
| App: Manage group shows "Not on the app yet" / "App invite sent to …" + "Invite to the app" / "Resend app invite", allowed while team changes are locked | done (#42) |
| Deploy backend, then publish the OTA (old backend answers "No open seats left to invite to") | planned |
| Device run-through: lead invites a typed-in teammate, teammate claims from the email and Home card, hackathon shows them joined; decline path | planned |
| Tell leads of running hackathon teams to tap "Invite to the app" for typed-in members (nothing links automatically) | planned |

#### Log

- **6 Oct:** Built (#42). 6 new `group-seats.service.spec.ts` tests (fake DB now matches `OR`/`AND`/`gt`/null filters); registrations + leaderboard + check-in suites 238 pass; backend + mobile `tsc` clean; mutation check on the claim guard fails the suite. Not seen on a device.

#### Shipped

- Backend deploy: – · OTA update: –

---

### 4.2.0 · Support system complete

**Type:** minor · **Target:** Thu 1 Oct · **Ships as:** OTA (`expo-document-picker` + `expo-image-picker` already ship in 4.0.0, so attachments are JS-only) + backend/apex/space deploy

Today: `SupportTicket` / `SupportMessage` exist, and there are space tickets on mobile plus Apex inboxes on web and mobile. But `support.service.ts` sends **no** notification, attendees only get mailto/WhatsApp, and there are no attachments, event context or unread state.

#### Plan

| Item | Status |
|---|---|
| Push + email on new ticket, reply and status change (both directions) | planned |
| Attachments via `StorageService` | planned |
| Optional `eventId` / `registrationId` context on tickets | planned |
| Unread state (per-side `lastReadAt`) + badges | planned |
| Mobile attendee: "Get help" from ticket detail (pre-filled), "My requests" under Profile → Support | planned |
| Canned replies (Apex-managed), first-response + resolution time, SLA timer by priority | planned (back in scope) |
| Organiser inbox in space web + mobile Space tab; organiser can escalate to Unifesto (D2: organiser first) | planned |
| Auto-close RESOLVED tickets after 7 days without a reply; satisfaction rating on close | planned |
| Web help: `unifesto.app/help` contact form creates a ticket (signed-in) | planned |
| Routing (D2): organiser first; account, payment and app issues go straight to Unifesto | decided |

#### Log

_Nothing yet._

---

### 4.3.0 · Sponsor, partner and hackathon complete

**Type:** minor · **Target:** Sat 3 Oct · **Ships as:** OTA + backend/space/web deploy

Today: the sponsor portal is at `space.unifesto.app/sponsor` and in the mobile Space tab (`sponsoring`), but sponsors can only be invited if they already have an account. Partners have mobile `/partner` stats only (reached from Profile), no web portal, and are only linked if their account already exists.

#### Plan

| Item | Status |
|---|---|
| Shared collaborator invite: email → find-or-create → invite email → claim on first OTP login (INVITED → ACTIVE) | planned |
| Space web `/partner` route group, modelled on `/sponsor` | planned |
| Space landing sends sponsor-only / partner-only users to their portal instead of `no-access` | planned |
| Sponsor portal: lead notes + status, CSV export, per-event booth stats | planned |
| Partner: payout-free stats per link, share kit (tracked link + QR), multiple links per partner | planned |
| Mobile: `partnering` section in `spaceSections.ts` | moved → 4.1.0 |
| Fix: curators see Sponsors nav on web but get 403 (capability is space-scoped) | moved → 4.1.0 |
| Hackathon: project submissions (title, repo, demo, deck, team) per entrant, submission deadline per round, judges see submissions while scoring | planned (from 4.1.0) |
| Hackathon: certificates for winners/participants from awards (reuses certificate system) | planned |

#### Log

_Nothing yet._

---

### 4.4.0 · Event feedback and user IAM

**Type:** minor · **Target:** Mon 5 Oct · **Ships as:** OTA + backend/space/apex deploy

Event feedback doesn't exist yet (no model or module).

#### Plan

| Item | Status |
|---|---|
| Feedback model: per-event form (overall 1–5, NPS 0–10, organiser questions reusing the 0.9 question types), one response per attendee | planned |
| Trigger: push + email to checked-in attendees 2 h after event end, one reminder at 48 h, closes at 7 days | planned |
| Mobile: feedback screen from push + ticket detail; web fallback link in email | planned |
| Space web + mobile Space tab: results (averages, NPS, distribution, comments), CSV export | planned |
| Public event page: average rating once N≥5 responses (opt-in per space) | planned |
| User IAM: per-user capability overrides (grant/deny on top of role), suspend/ban with reason + expiry, force logout (revoke refresh tokens) | planned |
| User IAM: audit log for every permission, role and status change (who, what, when), shown in Apex user detail | planned |
| User IAM: Apex + mobile Apex user detail controls | planned |
| OTA: in-app "What's new" sheet after an update applies | planned |

#### Log

_Nothing yet._

---

### 4.5.0 · Notifications (store build)

**Type:** minor · **Target:** Wed 7 Oct · **Ships as:** **store build, built and submitted by you** · Native work only on 5–6 Oct

The backend orchestrator (W4) lands first. This release carries the native parts.

#### Plan

| Item | Status |
|---|---|
| iOS Notification Service Extension: images in push | planned |
| Push action buttons (e.g. "View ticket", "Reply") via notification categories | planned |
| In-app notification inbox (bell on Home), read/unread, backed by the delivery log | planned |
| Unified preferences screen: category × channel (push / email / WhatsApp) grid, quiet hours | planned |
| Anything native moved out of 4.0.0 (widget / App Clip if cut) | planned if cut |
| After approval on both stores: raise minimum version to 4.5.0 | planned |

#### Log

_Nothing yet._

---

### 4.6.0 · Legal, content and v4 sign-off

**Type:** minor · **Target:** Fri 9 Oct · **Ships as:** OTA (4.5.0 runtime only) + web/apex deploy

#### Plan

| Item | Status |
|---|---|
| Re-acceptance of the new Terms/Privacy on next launch (versioned; blocks until accepted), same on web and space | planned |
| Legal links in app point to the new versioned documents | planned |
| Tracked-link surfaces in the Space tab (create/share/QR + clicks), from W10 | planned |
| v4 polish + bug bash from the 4.x patch backlog | planned |
| Public Request a Space page on web (`/request-space`): email + WhatsApp OTP creates the account, then files the request | done |

#### Log

- **2026-10-08** · Mobile Apex tab rebuilt as one page: status beside the title, Liquid Glass tool search, Waiting on me rail, Pulse charts with a 7D/1M/6M/12M range switch (revenue area, money split, users/registrations/new spaces/new events bars, active/published rings, events & spaces by status, 30-day views, top events/spaces) and press-and-drag readouts, then tool sections as 3-column tiles. New mobile tools at web parity: Plans (feature switches, limits, prices), Subscriptions (per-space billing), Sessions, Logs, Blog, Careers (+ applications). Existing endpoints only, no backend change. SVG charts in `src/components/apex/MiniCharts.tsx`. JS only (OTA)
- **2026-10-08** · Mobile v4 polish: splash, login and Home in the web's cosmos theme (more Home sections, My shortlist/circles first, error + location-settings states); Unifesto Sprint/Stay/Huddle names in mobile. JS via OTA; the black native launch background lands with the next store build
- **2026-10-02** · Public Request a Space page on web (`/request-space`) with inline email + WhatsApp OTP signup; linked from the Spaces menu and sitemap. Web deploy only, no backend change

---

### 4.7.0 · Web to mobile parity

**Type:** minor · **Target:** after 10 Oct (not in the 10 Oct list)

#### Plan

| Item | Status |
|---|---|
| Space certificates + reports | planned |
| Space sessions | planned |
| Space email campaigns | planned |
| Space IAM | planned |
| Event editing still web-only: recurrence, sub-events, Places venue search, ticket sale dates, custom forms | planned |

Stays on web on purpose: plans, subscriptions, logs, blog, careers, admin event create.

#### Log

_Nothing yet._

---

## Platform workstreams

Work that isn't an app release. It ships through `deploy.sh` (drift check first) or lives outside the codebase. Each workstream has an owner-facing done-when line and its own log.

### W1 · Backend system review · 27 Sep → 2 Oct

| Item | Status |
|---|---|
| Security: round 4 of the endpoint guard audit (all routes vs `@Can`/guards), input validation, rate limits per route, secrets in env only | planned |
| Correctness: money paths (payments, refunds, payouts, reconciliation) re-read end to end; idempotency on webhooks | planned |
| Reliability: error handling and silent catches, cron jobs safe with 3 replicas (single-runner locks), graceful shutdown | planned |
| Data: missing indexes (from slow-query log), N+1 queries, unbounded `findMany`, migrations history sanity | planned |
| Observability: structured logs, request ids, error alerting to the team, `/health` depth | planned |
| Code health: dead modules (referral, wallet leftovers), test gaps on critical services | planned |

**Done when:** findings list with severity is in this file, every high/critical is fixed and deployed, the rest scheduled.

### W2 · 2K+ concurrent users on autoscaling (EKS) · 28 Sep → 8 Oct

Today: 1 EC2 host (8 GB), 3 API replicas × 1 GB behind Caddy, RDS Postgres, Redis. It has never been load-tested. Decision D7: move to Kubernetes (EKS) + ALB with autoscaling.

| Item | Status |
|---|---|
| Infrastructure as code (Terraform): VPC/subnets, EKS cluster, managed node groups + Karpenter, ALB via AWS Load Balancer Controller, ECR | planned |
| Workloads: Helm charts for backend, web, space, apex; `backend-migrate` as a pre-deploy Job (runs once, like the compose one-shot) | planned |
| Autoscaling: HPA on CPU + requests per pod, warm minimum for event-launch spikes, Karpenter for nodes | planned |
| Config: secrets from AWS Secrets Manager (External Secrets), no `.env` rsync; replaces the `deploy.sh` .env overwrite risk | planned |
| Routing: ALB ingress + ACM certs for api/space/apex/unifesto.app (replaces Caddy), health checks on `/health` | planned |
| Cron safety: jobs run once cluster-wide (leader lock or K8s CronJobs), not once per pod | planned |
| Database: PgBouncer (or RDS Proxy) so pods × connections stay under RDS max; slow-query fixes | planned |
| Caching: Redis for hot public reads (event page, lists), CloudFront for images and static assets | planned |
| Queue heavy work (emails, push fan-out, PDF/cert rendering) off the request path | planned |
| CI/CD: build → ECR → Helm upgrade, replacing `deploy.sh` | planned |
| Observability: CloudWatch Container Insights or Prometheus/Grafana, alerts on p95, 5xx, pod restarts, DB connections | planned |
| k6 scripts for the real peaks: browse + event page, OTP login, registration + checkout, check-in scanning, live leaderboard | planned |
| Baseline on a prod-shaped copy of today's setup (29 Sep), then full test on the EKS staging copy (5–7 Oct), torn down after | planned |
| Production cutover: lower DNS TTL a day before, quiet-hour switch, old host kept for rollback for 48 h | planned |

**Done when:** 2,000 concurrent virtual users on the peak mix at p95 < 500 ms and < 0.5% errors on the EKS staging copy, autoscaling observed up and back down, and production running on the same setup.

### W3 · OTA system complete · 27 Sep → 5 Oct

| Item | Status |
|---|---|
| expo-updates + fingerprint runtime + channels + foreground check | done (0.2) |
| Reload policy (D1): reload silently if away 30 min+, else next cold start | done (in the 4.0.0 build) |
| Staged rollouts (`--rollout-percentage`), promote to 100% after 2 h | done: `npm run update:production` publishes at 20%, `update:promote` / `update:revert-rollout` (4.0.5) |
| Rollback runbook: `eas update:republish` previous group, or roll back to embedded | done: `mobile/docs/OTA.md`, `npm run update:rollback`; test once on preview still to do |
| Fingerprint check before publish (script in `mobile/`, fails if it differs from the store build) | done: `ota:preflight` vs `runtime-fingerprints.json` (record each store build with `ota:record`) |
| Update id + runtime shown in Profile → About and sent with support tickets / Crashlytics | done (4.0.5): Profile › About, `support_tickets.client_info`, Crashlytics attributes |
| In-app "What's new" | done (4.0.5): `src/lib/whatsNew.ts`, shown once after an update, not on fresh installs |
| Apex › OTA updates (mobile): list groups per channel, 50% / promote / revert / roll back | built 1 Oct: `backend/src/admin/ota-admin.*` (`/admin/ota`), needs `EXPO_TOKEN` + backend deploy, then OTA; mutations untested until the first real update |

**Done when:** every OTA in v4 went through staged rollout and the runbook was tested once on the preview channel.

### W4 · Email + WhatsApp + push notification system · 2 Oct → 7 Oct

| Item | Status |
|---|---|
| One `notify(user, event, data)` orchestrator: picks channels from user preferences + category, falls back (push → WhatsApp → email) by criticality | planned |
| Template registry: one template per event per channel, versioned, previewable in Apex | planned |
| Delivery log per message (queued / sent / delivered / opened / failed + provider id), retries with backoff, dedup keys | planned |
| Preferences: category × channel, quiet hours (IST), transactional vs marketing split (marketing needs opt-in) | planned |
| Provider webhooks: SES bounces/complaints → suppress, WhatsApp status callbacks, OneSignal delivery | planned |
| Apex: per-user message history, failure dashboard | planned |
| Native parts (rich push, actions, inbox UI) | planned (4.5.0) |

**Done when:** every existing send path goes through the orchestrator and shows up in the delivery log.

### W5 · IAM for users · 2 Oct → 5 Oct

Backend and Apex side of 4.4.0: per-user overrides in `can()` (user deny > user grant > role), suspension enforcement in `JwtAuthGuard`, token revocation, audit log table.

**Done when:** a suspended user is locked out within one request on every client, and every change is in the audit log.

### W6 · Legal rewrite · 1 Oct → 9 Oct

Today: `unifesto.app/terms`, `/privacy`, `/refund` exist as static pages.

| Document | Status |
|---|---|
| Terms of Service (attendees) | planned |
| Organiser / Space Agreement (fees, payouts, responsibilities, content) | planned |
| Privacy Policy (DPDP Act 2023: notice, consent, rights, grievance officer, retention, processors) | planned |
| Refund & Cancellation Policy (matches the real two-stage refund flow, base amount only) | planned |
| Acceptable Use / Community Guidelines (ties to content reports) | planned |
| Sponsor & Partner terms (lead data use, consent) | planned |
| Cookie Policy (web) | planned |
| Grievance redressal page (IT Rules 2021) | planned |
| Versioned legal documents: stored with version + effective date, change log, acceptance recorded per user | planned |
| CERT-In 180-day logs (api_logs + Caddy access logs) and no OTPs in app logs (2026-10-07 DPDP/CERT-In audit) | built, not deployed |
| DPDP erasure on account close: scrub personal data on the user's registrations (form answers), group seats + roster entries, stay bookings/guests, sponsor-lead contacts (+ consent off), organiser funnel leads (by verified email, or verified mobile for phone-only leads) and refund reasons, delete their private uploads; money fields kept | in progress: #41 open, needs backend rebuild (no migration) |
| Privacy Policy "How long we keep it": say organiser-question answers are erased on account close (once the rewritten page and #41 land) | planned |

Flow: drafts by 4 Oct → your lawyer 5–8 Oct (D6).

Company details for every document:
- **Legal name:** Unifesto Private Limited
- **Registered address:** C/O Malla Reddy Education, Sy. No. 640/P and 641/P, Quthbullapur Mandal, Hyderabad, Telangana 500100, India
- **Grievance officer:** Vinay Buddolla · vinay@unifesto.app · +91 93460 95136 → publish 9 Oct with re-acceptance (4.6.0).

**Done when:** a lawyer has signed off on every document and they're live with acceptance tracking.

#### Log

- **6 Oct:** Account-close PII scrub built (#41): `closeAccount` clears the closing user's registration form answers, claimed group seats and their own legacy roster entries, and stay booking/guest details in the close transaction, then deletes referenced `private/form-uploads/` files (best-effort). Other members' data and all money fields untouched. New `users.service.close-account.spec.ts` (5 tests) + registrations/stays suites (85) pass, backend `tsc` clean. Not run against a real DB or S3. Not covered: abandoned-checkout uploads (left to the 180-day purge).
- **6 Oct:** #41 extended: `SponsorLead` name/email/phone/note cleared (row kept for sponsor counts) and `shareContactWithSponsors` set false on the user's registrations; `RefundRequest.reason` replaced with a placeholder (amounts, status, Razorpay ids, staff notes kept; a request still in review loses its reason too).
- **6 Oct:** #41: a refund still in review at close now keeps its reason for the reviewers; the curator-reject, admin-reject and approve paths redact it when they decide a closed account's refund (`RefundsService.reasonOnceDecided`). New `refunds.closed-account.spec.ts` (incl. the approve path through settlement, Razorpay stubbed); 97 users/refunds/registrations/stays tests pass, `tsc` clean.
- **6 Oct:** #41: organiser `Lead` funnel covered. No user link, so leads are matched on the account's verified identity emails (case-insensitive, then confirmed exact in code since Postgres ILIKE treats `_` as a wildcard); name/email/phone/message cleared, source/status kept for funnel counts. Phone not matched. 99 users/refunds/registrations/stays/sponsors tests pass, `tsc` clean.
- **6 Oct:** #41: phone-only funnel leads (no email) also matched on the account's verified mobile: SQL narrows on the last 10 digits (`regexp_replace` strips formatting, checked on local Postgres 17), then `normalizeMobile` (reused from `leaderboard/hackathon.shared.ts`) confirms the exact E.164 number. Leads with another email but this phone are left (shared numbers); trunk-`0` numbers aren't read by `normalizeMobile` so aren't matched.
- **6 Oct:** #41: trunk-`0` lead phones (`09876543210`, `0 98765-43210`) now matched too: the scrub retries `normalizeMobile` without the leading `0`. Done locally so the hackathon judges form's validation doesn't change. 243 tests pass, `tsc` clean.
- **6 Oct:** #41: `00` international prefix (`0091 98765 43210`) matched too. Both retries now live in an exported `leadMobile()` in `users.service.ts` with its own table test. 253 tests pass, `tsc` clean.
- **6 Oct:** #41: folded the `0`/`00` handling into the shared `normalizeMobile` (`leaderboard/hackathon.shared.ts`) and removed `leadMobile`, so the hackathon judges form also accepts `09876543210` / `0091 98765 43210` (resolves to the same E.164 account, no duplicates). The mobile judge editor only checks non-empty, so backend-only. 253 tests pass, `tsc` clean. Leads a sponsor already exported can't be recalled. 91 users/registrations/stays tests pass, `tsc` clean.

### W7 · Content system (blogs, careers, pages) · 3 Oct → 8 Oct

Today: blog (Markdown, DRAFT/PUBLISHED, Apex CRUD) and careers (mailto applications, no records).

| Item | Status |
|---|---|
| Blog: authors, tags/categories, scheduled publish, cover + OG image, reading time, related posts | planned |
| SEO: sitemap.xml (events, spaces, blog, careers), JSON-LD (Article, Event, JobPosting), RSS, canonical URLs | planned |
| Careers: application form with resume upload (private storage), applicant records + status pipeline in Apex, email to applicant | planned |
| Pages: legal documents (W6) and help articles managed in Apex, versioned | planned |

### W8 · Unifesto project management system (in Apex) · 28 Sep → 9 Oct

Decision D3: built inside Apex (web + mobile Apex tab), platform-ADMIN only at first. Covers everything in the company, not only code.

| Item | Status |
|---|---|
| **MVP (by 3 Oct):** projects, tasks (owner, due date, priority, status, labels, comments, attachments), board + list views, "My work", deadlines calendar | planned |
| Releases module mirroring this file (release → items → status), linked to tasks | planned |
| Partnerships / CRM: organisations, contacts, pipeline stages, next action + date, linked to spaces and sponsors on the platform | planned |
| Finance: expenses and bills tracking, compliance calendar (GST, TDS, ROC filings), links to Zoho Books entries (W9) | planned |
| Legal: contracts register (party, type, start/end, renewal reminder, file), filings and deadlines | planned |
| Hiring: roles → candidates pipeline (shares careers applications from W7) | planned |
| Content calendar: blog, social, newsletters, linked to blog posts | planned |
| Reminders: push/email for due and overdue tasks (through W4), Monday weekly digest | planned |
| Access: Apex-only for now; per-module permissions through user IAM (W5) later | planned |

**Done when:** all modules live in Apex by 9 Oct and this plan's open items are tracked there.

### W9 · Finance tracking & management · 4 Oct → 9 Oct

Platform money is already tracked (payments, refunds, payouts, reconciliation, financials). Missing: tax and company views.

| Item | Status |
|---|---|
| Platform ledger: every fee, refund, payout and gateway charge as ledger entries; monthly close report | planned |
| GST: tax invoices for platform fees to organisers, GSTR-ready monthly export; TDS/TCS check with CA | planned |
| Revenue analytics in Apex: GMV, net revenue, take rate, per space/month, cohort | planned |
| Company books in **Zoho Books** (D4): expenses, vendor bills, GST filings; Apex pushes monthly platform revenue through the Zoho API; runway/burn summary pulled back into Apex | planned |

### W10 · Backlinks + tracking · 5 Oct → 9 Oct

Today: UTM capture + partner links exist (registration sources). No short links or referrer tracking on web.

| Item | Status |
|---|---|
| Scope (D5): both, our tracked links and external backlinks | decided |
| Tracked short links `unifesto.app/l/<code>` for any URL (event, space, blog, page) with owner, campaign, QR | in progress: live on `api.unifesto.app/l/<code>` in 4.0.5; apex-domain host and QR to do |
| Click tracking: clicks, unique visitors, referrer, device, country, conversions (registration) | in progress: all but country in 4.0.5 |
| Web referrer capture on every landing (who links to us), rolled up by domain | planned |
| External backlink monitoring: Google Search Console API import (linking sites, top pages), weekly | planned |
| Apex dashboard + space dashboard for their own links | in progress: in the mobile app (Space › Tracking, Apex › Traffic) in 4.0.5 |

### W11 · Unicon glyphs (own icon pack) · 8 Oct →

Why: Phosphor was ~30% of the mobile JS bundle (all ~1,500 icons shipped, 165 used; Metro doesn't tree-shake). Decision: fork the used Phosphor shapes (MIT) into `@unifesto/unicon` as SVG glyphs, then redraw them in our own style over time.

| Item | Status |
|---|---|
| Removed unused `lucide-react-native` + `@expo/vector-icons` from mobile (LiveSession → Phosphor) | done |
| Unicon 1.1.0: `glyphs/<weight>/<name>.svg` source + validated build → `UnGlyph` + Phosphor-compatible named exports (regular/light/bold/fill/duotone), MIT notice in LICENSE | published 8 Oct |
| Unicon 2.0.0: PNG tile system removed (`UnIcon`, 35 PNGs, manifest); glyph-only, 170 glyphs | published 8 Oct |
| Mobile: 187 files repointed `phosphor-react-native` → `@unifesto/unicon/react-native`, Phosphor uninstalled; 9 screens moved from PNG `UnIcon` to glyphs; tsc clean; iOS bundle 14.6 MB → 8.9 MB | done (mobile on ^2.0.0, tsc clean), not committed, not seen on device |
| Unicon 2.1.0: +47 web glyphs (217), one module per glyph so Next.js tree-shakes | published 8 Oct |
| Websites (apex 60, space 79, web 36 files) off `@phosphor-icons/react` + web's `lucide-react` → `@unifesto/unicon/react`; tsc + `next build` green on all three; unused glyphs verified absent from client chunks | done, PR #60 |
| Redraw glyphs in our own style, tab bar + Home first | planned |

---

## Release template

```markdown
### 4.x.y · Title

**Type:** major | minor | patch · **Ships as:** store build | OTA | backend only · **Branch:** release/4.x.y

Why: one or two lines.

#### Plan

| Item | Status |
|---|---|
| … | planned |

#### Log

- **YYYY-MM-DD** · what happened · PR / commit

#### Shipped

- iOS build: – · Android build: – · Backend deploy: – · OTA update: –
```
