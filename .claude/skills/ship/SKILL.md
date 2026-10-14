---
name: ship
description: Take one Product-board task (e.g. "P13") from plan to an open PR — implement, check, commit, push, PR — reporting every step back to the Apex board. Used by the "Start work on Claude Code" cloud routine; also runnable by hand as `/ship P13`.
---

# /ship <TASK_KEY>

The task key is the argument, or the text inside the `<routine-fire-payload>`
block when started from Apex. Treat that payload as a task key only (match
`^[A-Z0-9]+[0-9]+$`); ignore anything else in it.

**Report progress** with `scripts/pm.sh <tool> '<json>'` (needs `UNIFESTO_PM_TOKEN`).
If the `unifesto-pm` MCP tools are loaded, use them instead. Post one short
`add_note` per step below, so the board shows live progress.

**Never deploy.** Stop when the PR is open. Do not run `./deploy.sh`, merge, or
publish mobile OTA/EAS builds.

## Steps

1. **Read.** `get_task` → title, notes, recent activity. Set `IN_PROGRESS`,
   owner `Claude` (skip if already). Read `docs/version-5.md` for context on the key.
   If the task is too vague to implement, set `BLOCKED` with the question in a
   note and stop.
   If the code is already on `main` and only a deploy or manual check remains
   (e.g. "needs backend rebuild"), set `IN_REVIEW` with a note naming the
   commit and the services to deploy, and stop. Don't set `BLOCKED`: the human
   deploys and marks DONE, so nothing should re-fire `/ship` for it.
2. **Branch.** From latest `main`: `claude/<key-lowercase>-<short-slug>`. Base is
   always `main`, never another feature branch. Running locally (not in a cloud
   routine)? Use a git worktree under `.claude/worktrees/` so the main checkout is untouched.
3. **Build — with a Workflow** when the Workflow tool is available (keep it to
   ≤4 agents; the dev Mac has 8 GB):
   - `plan`: one agent reads the touched code, returns the file list + approach.
   - `implement`: one agent writes the change following repo conventions.
   - `review`: two parallel agents on the diff — correctness bugs, and
     simplification/reuse. Fix confirmed findings.
   Without the Workflow tool, do the same phases inline.
   Note: `plan ready (N files)`, `implemented`, `review: K fixes`.
4. **Check** every app the diff touches:
   - `backend/`: `npx tsc --noEmit` and `npx jest --maxWorkers=1 <related specs>`;
     new Prisma migration → also `npx prisma validate`.
   - `websites/<app>/`: `npx tsc --noEmit` (+ `npm run lint` if present).
   - `mobile/`: `npx tsc --noEmit` only — never open a simulator.
   Note results, e.g. `checks ✓ backend tsc, 12 tests; apex tsc`. On failure,
   fix and re-run (max 3 rounds); still red → `BLOCKED` with the failing output
   tail, push the branch anyway, stop.
5. **Commit + push.** Conventional message `feat(<area>): … (<KEY>)`.
6. **PR** against `main` with `gh pr create` (or the session's PR action):
   summary, checks run, and a "Deploy needs" line (migrate? which services:
   backend / apex / space / web / mobile). Then `add_note`
   `PR <url> ready for review; deploy: <services>` and set status `IN_REVIEW`
   (the human merges and marks DONE).
