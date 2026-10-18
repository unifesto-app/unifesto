## What changed and why


## Release
- Target release (see `docs/version-5.md`): 5.x.y
- Ships as (mobile: copy the result of the OTA-safe step in "CI passed", OTA-safe ✓ / store build; until the CI check lands, `npm run ota:preflight`): OTA-safe ✓ · store build (`native` label) · no mobile change

## Checklist
- [ ] CI passed
- [ ] New migrations read; no DROP / destructive ALTER, or it's called out below
- [ ] Mobile: the OTA-safe step in CI passed, or this PR has the `native` label and waits for the next store-build window (`mobile/docs/OTA.md`)
- [ ] `docs/version-5.md` updated (item status + log line)
- [ ] Tested where it runs (device / browser / API), or says here why not
