# OTA updates (EAS Update): runbook

JS-only changes ship over the air. Native changes (a new native module, a config
plugin, native parts of `app.config.js`) need a store build. The app uses
`runtimeVersion: fingerprint`, so an update only reaches builds with the same
native fingerprint; everything below keeps that honest.

All commands run from `mobile/`.

## After every store build goes live

Record its runtime so later OTAs can be checked against it:

```bash
npm run ota:record-build
```

This reads the latest finished production store build per platform from EAS
(`eas build:list`, read-only) and adds its runtime to `runtime-fingerprints.json`.
Commit the file with the release. Keep the fingerprints of every build still in use; delete one only once
the minimum version is raised past it.

## Publishing an update

> **Until the next store build:** `npm run update:production` fails bundling for web
> (Expo defaults `platforms` to include web). Setting `platforms` in `app.config.js` or
> editing `package.json` scripts changes the fingerprint, so both have to wait for a store
> build. Until then, bundle iOS + Android yourself and upload with `--skip-bundler`:
>
> ```bash
> npm run ota:preflight
> eas env:exec production "npx expo export --output-dir dist --experimental-bundle --dump-sourcemap --dump-assetmap --platform ios --platform android --clear"
> eas update --channel production --environment production --rollout-percentage=20 --skip-bundler --message "…"
> ```
>
> With the next store build, add `platforms: ["ios", "android"]` to `app.config.js`, then `ota:record-build`.

```bash
npm run update:production
```

1. **Preflight** (`ota:preflight`): refuses if this checkout's fingerprint matches no
   recorded live build on either platform. That means native code changed: ship a
   store build instead. `eas fingerprint:compare --environment production` shows why.
2. **Staged rollout**: publishes to **20%** of production installs.
3. Add a "What's new" entry in `src/lib/whatsNew.ts` first if the release has
   anything people will notice. It ships inside the update and shows once after it applies.

## Promote, pause, roll back

| Situation | Command |
|---|---|
| 2 h at 20%, Crashlytics clean (filter by `update_id`) | `npm run update:promote` → pick the update → 100% |
| Crash spike or bad bug during the rollout | `npm run update:revert-rollout` (everyone goes back to the previous update) |
| Already at 100% and broken | `npm run update:rollback` → choose "previous update" (republish the last good group) or "embedded" (the code shipped in the store build) |

The same three (set 50% / promote to 100%, revert rollout, roll back by republishing an
earlier update) are in the admin app under **Apex › OTA updates**, which lists what's
published per channel. It needs `EXPO_TOKEN` (an Expo robot token with access to the
project) in the backend's `.env`. Rolling back to the embedded code stays CLI-only.

Rollback is interactive; it asks which channel and which update. Test it once on
the `preview` channel before relying on it (W3 done-when).

## What a phone does with an update

- Checks on cold start and on every return to the foreground (at most every 30 minutes).
- Downloads in the background. Applies silently if the app was away 30 minutes or
  more (decision D1), otherwise on the next cold start.
- Profile › About shows the running build, runtime and update id, and has a
  manual "Check for updates" with "Restart now".
- Crashlytics reports carry `app_version`, `app_build`, `runtime_version`,
  `update_channel` and `update_id`; support tickets carry the same (Apex › Support
  shows it as "App").
