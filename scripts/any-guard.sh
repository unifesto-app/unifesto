#!/usr/bin/env bash
# J19: the backend compiles without `strict`, so `any` creeps in silently.
# The money paths are kept free of it: this fails when the count of explicit
# `any` (`: any`, `as any`, `<any>`, `any[]`) in them rises above MAX. Specs
# and comments don't count. Lowered a ceiling? Lower MAX with it.
# Run from the repo root: bash scripts/any-guard.sh
set -u
MAX=0
cd "$(dirname "$0")/../backend/src" || exit 1
hits=$(grep -rnE '(:\s*any\b|\bas any\b|<any>|\bany\[\])' --include='*.ts' --exclude='*.spec.ts' \
  payments payouts refunds subscription coupons \
  registrations/registration-checkout.service.ts \
  registrations/registration-payments.service.ts \
  registrations/registration-cancellation.service.ts \
  registrations/waitlist.service.ts |
  grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)')
count=$(printf '%s' "$hits" | grep -c . || true)
if [ "$count" -gt "$MAX" ]; then
  echo "$hits"
  echo "::error::$count explicit 'any' in the money modules (max $MAX). Type them instead (see scripts/any-guard.sh)."
  exit 1
fi
echo "Money modules: $count explicit 'any' (max $MAX)."
