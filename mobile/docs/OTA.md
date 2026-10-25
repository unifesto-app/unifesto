# OTA updates (EAS Update): runbook

JS-only changes ship over the air. Native changes (a new native module, a config
plugin, native parts of `app.config.js`) need a store build. The app uses
`runtimeVersion: fingerprint`, so an update only reaches builds with the same
native fingerprint. Everything below keeps that honest.

All commands run from `mobile/`.

## What changes the runtime

- Adding, removing or upgrading a package with native code (`ios/` or `android/` inside it).
- Adding or changing a config plugin, or a native field in `app.config.js`
  (`ios`, `android`, `plugins`, `platforms`, permissions, entitlements, ...).
- Env vars read by `app.config.js` (today only `GOOGLE_MAPS_ANDROID_API_KEY`).
  That is why every command below loads the EAS `production` environment first.

What does **not** change it: JS/TS, assets, `src/lib/whatsNew.ts`, and npm
`scripts` in `package.json` (skipped via `sourceSkips` in `fingerprint.config.js`
from 5.0.0 on).

When unsure: `npm run ota:preflight`, or
`eas fingerprint:compare --environment production` to see which file moved.

## Native PRs and store-build windows

From **2 Dec 2026** (5.0.0 live) on:

- A PR that changes the runtime gets the `native` label and stays open until the
  next store-build window. At the window, all `native` PRs merge together right
  before the build, so `main` stays OTA-safe in between.
- JS PRs never wait for a window. They merge and ship as OTAs.
- All PRs still base on `main` (no stacking).
- The PR template's "Ships as" is the CI result (OTA-safe / store build), not a guess.

Before 2 Dec, native PRs merge normally; they ride the 5.0.0 store build.

## After every store build goes live

Record the runtime **the EAS build reports**, not one hashed from your checkout
(a local tree can differ from what EAS built, see `fingerprint.config.js`):

```bash
npm run ota:record-build
```

This reads the latest finished production store build per platform from EAS
(`eas build:list --json`, read-only) and adds its `runtimeVersion` to
`runtime-fingerprints.json` under the build's channel. Commit the file with the
release. Keep every runtime still in use; delete one only once the minimum app
version is raised past it.

## Publishing an update

1. Add a "What's new" entry in `src/lib/whatsNew.ts` if the release has anything
   people will notice. It ships inside the update and shows once after it applies.
2. Publish:

   ```bash
   npm run update:production
   ```

   - **One rollout at a time** (`ota:rollout-guard`): refuses while the newest update
     of any runtime on the channel is a staged rollout below 100%. Promote or revert
     it first (**Apex › OTA updates** or `eas update:list --branch production`).
   - **Preflight** (`ota:preflight`) refuses if this checkout's fingerprint matches
     no recorded live build on either platform. That means native code changed:
     it needs a store build, not an OTA.
   - **Staged rollout**: publishes to **20%** of production installs.
3. Upload the update's source maps to Sentry (store builds do this on EAS; an OTA
   doesn't), from the same checkout right after publishing:

   ```bash
   npx sentry-expo-upload-sourcemaps dist
   ```

   `eas update` leaves the bundles and maps in `dist/`. Org and project come from
   the Sentry plugin in `app.config.js`; the script needs `SENTRY_AUTH_TOKEN` in
   your shell (an EAS env var marked secret can't be read locally). Skip it and that
   update's stack traces stay minified.

Builds from before 5.0.0 (4.0.x) lack `platforms: ["ios", "android"]`, so their
runtime never matches `main` again; they only move forward via the store.

## Promote, pause, roll back

| Situation | Command |
|---|---|
| 2 h at 20%, Crashlytics clean (filter by `update_id`) | `npm run update:promote` → pick the update → 100% |
| Crash spike or bad bug during the rollout | `npm run update:revert-rollout` (everyone goes back to the previous update) |
| Already at 100% and broken | `npm run update:rollback` → choose "previous update" (republish the last good group) or "embedded" (the code shipped in the store build) |

The same three (set 50% / promote to 100%, revert rollout, roll back by
republishing an earlier update) are in **Apex › OTA updates**, which lists what's
published per channel. It needs `EXPO_TOKEN` (an Expo robot token with access to
the project) in the backend's `.env`. Rolling back to the embedded code stays CLI-only.

Rollback is interactive; it asks which channel and which update. Test promote,
revert and rollback once on the `preview` channel (`npm run update:preview`, with
an internal preview build) before relying on them.

## Store launch (5.0.0, and every store build after it)

Nothing reaches the stores' users until you press release. Freeze Fri 20 Nov,
submit Wed 25 Nov, release Wed 2 Dec (version-5 D6, R1–R5, Z10).

1. **Before submit:** give the production build to organisers and Crew on
   TestFlight and Play internal testing; each runs create event → register →
   check in. Publish a no-op OTA to the `preview` channel and confirm a preview
   build receives it.
2. **Submit:** `eas submit --profile production --platform all`. Android uploads
   as a **draft** on the Production track (`releaseStatus: "draft"` in
   `eas.json`), so it never goes live on submit. iOS lands in App Store Connect;
   set the version to "Manually release this version" and turn on **phased
   release** (7 days) before sending it for review.
3. **Release day:** App Store: Release. Play: edit the draft release, staged
   rollout 10% → 50% (day 2) → 100% (day 3).
4. **Pause rule:** crash-free sessions under 99% in Sentry (`unifesto-mobile`),
   or a spike in registration or payment errors. App Store: pause phased
   release. Play: halt the rollout. Ship the fix as an OTA once the new runtime is
   recorded (below), else as a new build. The app has no feature flags, so the
   OTA is the only switch.
5. **Same day:** `npm run ota:record-build`, publish a tiny 5.0.1 OTA at 20% and
   confirm a phone shows its update id in Profile › About. Set the latest version
   in Apex › App version to turn on the soft update prompt.

## What a phone does with an update

- Checks on cold start and on every return to the foreground (at most every 30 minutes).
- Downloads in the background. Applies silently if the app was away 30 minutes or
  more (decision D1), otherwise on the next cold start.
- Profile › About shows the running build, runtime and update id, and has a
  manual "Check for updates" with "Restart now".
- Crashlytics reports carry `app_version`, `app_build`, `runtime_version`,
  `update_channel` and `update_id`; support tickets carry the same (Apex › Support
  shows it as "App").
