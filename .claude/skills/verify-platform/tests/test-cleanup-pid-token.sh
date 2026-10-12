#!/usr/bin/env bash
# cleanup.sh must signal dev.pid only while its /proc start time still matches
# dev.starttime, so a reused pid is never killed. a `setsid sleep` stands in
# for the dev server. KEEP_DB=1 and an absent pg dir keep postgres out of it;
# like any cleanup.sh run it removes apps/platform/.env.verify.
set -uo pipefail
S=$(cd "$(dirname "$0")/../scripts" && pwd)
T=$(mktemp -d); victim=
trap '[ -n "$victim" ] && kill -- -"$victim" 2>/dev/null; rm -rf "$T"' EXIT
export KEEP_DB=1 VERIFY_PG_DIR=$T/pg VERIFY_STATE=$T/state
fails=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
starttime() { sed 's/.*) //' "/proc/$1/stat" | cut -d' ' -f20; }
# $1 name, $2 token to record ("" = none), $3 alive|dead expected afterwards
check() {
  setsid sleep 300 & victim=$!
  mkdir -m 700 "$VERIFY_STATE"; echo "$victim" >"$VERIFY_STATE/dev.pid"; echo 4299 >"$VERIFY_STATE/port"
  local token=$2; [ "$token" = MATCH ] && token=$(starttime "$victim")
  [ -n "$token" ] && echo "$token" >"$VERIFY_STATE/dev.starttime"
  out=$("$S/cleanup.sh" 2>&1)
  sleep 0.2; kill -0 "$victim" 2>/dev/null && state=alive || state=dead
  [ "$state" = "$3" ] && ok "$1: $state ($(head -1 <<<"$out"))" || bad "$1: $state, want $3 ($out)"
  kill -- -"$victim" 2>/dev/null; wait "$victim" 2>/dev/null; victim=
}
check "no dev.starttime" "" alive
check "mismatched dev.starttime" 1 alive
check "matching dev.starttime" MATCH dead
[ "$fails" = 0 ] && echo "ALL PASS" || echo "$fails FAILED"
exit "$fails"
