#!/usr/bin/env bash
# S37: destructive SQL in Prisma migrations. One check, two callers:
#   CI         scripts/migration-guard.sh <new migration.sql files in the PR>
#   deploy.sh  scripts/migration-guard.sh --deploy <migrations the server's
#              backend image doesn't have yet>
# DROP TABLE / DROP COLUMN fails. In CI a `-- contract-step` comment (the
# reviewed second half of an expand/contract change) turns that into a warning.
# --deploy (J13) blocks it anyway, plus ALTER COLUMN ... TYPE and TRUNCATE, so a
# contract step ships in its own deploy with ALLOW_DESTRUCTIVE=1. Other
# destructive SQL only warns. See remove_chat, 2026-09-25.
set -u

deploy=0
if [ "${1:-}" = --deploy ]; then deploy=1; shift; fi

say() { # level file message
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::$1 file=$2::$3"; else echo "  $1: $2: $3"; fi
}

DROPS='\bDROP\s+(TABLE|COLUMN)\b'
RISKY='\bDROP\s+(TYPE|INDEX|CONSTRAINT)|ALTER\s+COLUMN\s+.*\s+TYPE\b|TRUNCATE'
REWRITES='ALTER\s+COLUMN\s+.*\s+TYPE\b|TRUNCATE'

failed=0
for f in "$@"; do
  if grep -niE "$DROPS" "$f"; then
    if [ "$deploy" = 1 ]; then
      say error "$f" "DROP COLUMN/TABLE pending on the server. Ship it in its own deploy, after the code that stopped using it."
      failed=1
    elif grep -qiE '^\s*--\s*contract-step\b' "$f"; then
      say warning "$f" "DROP in a marked contract step. Read it before deploying."
    else
      say error "$f" "DROP COLUMN/TABLE in a new migration. Make it additive, or mark a reviewed contract step with a '-- contract-step' comment."
      failed=1
    fi
  fi
  if grep -niE "$RISKY" "$f"; then
    if [ "$deploy" = 1 ] && grep -qiE "$REWRITES" "$f"; then
      say error "$f" "Column type change or TRUNCATE pending on the server."
      failed=1
    else
      say warning "$f" "Destructive SQL in a new migration. Read it before deploying."
    fi
  fi
done
exit $failed
