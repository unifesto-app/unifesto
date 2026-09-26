## What changed and why


## Release
- Target release (see `docs/version-4.md`): 4.x.y
- Ships as: OTA · store build · backend/web deploy only

## Checklist
- [ ] CI passed
- [ ] New migrations read; no DROP / destructive ALTER, or it's called out below
- [ ] Mobile: no new native module / config plugin during a native freeze (or this targets a store build)
- [ ] `docs/version-4.md` updated (plan status + log line)
- [ ] Tested where it runs (device / browser / API), or says here why not
