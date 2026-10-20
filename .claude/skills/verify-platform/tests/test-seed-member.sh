#!/usr/bin/env bash
# seed-member.mjs must find the npo seed.sql creates (`VERIFY0001`), make the
# member one of its members, seed a platform admin, and stay idempotent.
# needs VERIFY_TEST_DB: a local postgres url already migrated and seeded with
# seed.sql (launch.sh's first steps). skipped without it.
set -uo pipefail
S=$(cd "$(dirname "$0")/../scripts" && pwd)
DB=${VERIFY_TEST_DB:-}
[ -n "$DB" ] || { echo "SKIP: set VERIFY_TEST_DB to a migrated, seed.sql'd local db"; exit 0; }
PSQL=$(command -v psql || ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -d "$PSQL" ] && PSQL=$PSQL/psql
fails=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
q() { "$PSQL" "$DB" -tAc "$1"; }

for run in first second; do
  out=$(DATABASE_URL=$DB node "$S/seed-member.mjs" 2>&1) \
    && ok "$run run exits 0" || bad "$run run: $out"
done
[ "$(q "select n.registration_number from user_npo_memberships m
         join npos n on n.id = m.npo_id join \"user\" u on u.id = m.user_id
         where u.email = 'verify-member@example.com'")" = VERIFY0001 ] \
  && ok "member belongs to VERIFY0001 only" || bad "member membership wrong"
[ "$(q "select role from \"user\" where email = 'verify-admin@example.com'")" = admin ] \
  && ok "admin seeded with role admin" || bad "admin missing or not admin"
[ "$(q "select count(*) from account a join \"user\" u on u.id = a.user_id
         where u.email = 'verify-admin@example.com' and a.provider_id = 'credential'")" = 1 ] \
  && ok "admin has one credential account" || bad "admin credential account count"

[ "$fails" = 0 ] && echo "ALL PASS" || echo "$fails FAILED"
exit "$fails"
