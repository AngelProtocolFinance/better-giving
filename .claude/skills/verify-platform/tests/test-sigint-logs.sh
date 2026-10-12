#!/usr/bin/env bash
# ^C mid-run must still leave the server logs in $VERIFY_OUT, then clean up:
# state dir gone, dev server, postgres and browser stopped. starts a real
# run.sh on spare ports and interrupts it once drive.mjs is running.
#   tests/test-sigint-logs.sh [INT|TERM]   (default INT)
set -uo pipefail
SIG=${1:-INT}
S=$(cd "$(dirname "$0")/../scripts" && pwd)
T=$(mktemp -d)
export VERIFY_OUT=$T/out VERIFY_STATE=$T/state VERIFY_PG_DIR=$T/pg \
  VERIFY_PORT=4277 VERIFY_PG_PORT=5477 VERIFY_WS_PORT=5478
fails=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# job control gives run.sh its own process group with default signal handling;
# a plain `&` child of a script starts with SIGINT ignored, which bash can't trap
set -m
"$S/run.sh" >"$T/run.txt" 2>&1 &
pid=$!
set +m
for _ in $(seq 1 300); do
  [ -s "$VERIFY_OUT/drive.txt" ] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
if [ -s "$VERIFY_OUT/drive.txt" ] && kill -0 "$pid" 2>/dev/null; then
  sleep 1
  echo "sending SIG$SIG to run.sh ($pid) mid-drive"
  kill -"$SIG" "$pid"
else
  bad "run.sh never reached drive.mjs (or already exited); see $T/run.txt"
fi
for _ in $(seq 1 60); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
kill -0 "$pid" 2>/dev/null && { bad "run.sh still running 60s after SIG$SIG"; kill -KILL -- "-$pid"; }
wait "$pid"; rc=$?
want=$([ "$SIG" = INT ] && echo 130 || echo 143)
[ "$rc" = "$want" ] && ok "run.sh exited $rc" || bad "run.sh exited $rc, want $want"

for f in dev.log migrate.log; do
  [ -s "$VERIFY_OUT/$f" ] && ok "$f copied to VERIFY_OUT ($(wc -l <"$VERIFY_OUT/$f") lines)" || bad "$f missing from VERIFY_OUT"
done
[ -e "$VERIFY_STATE" ] && bad "state dir still exists" || ok "state dir removed"
[ -e "$VERIFY_PG_DIR" ] && bad "pg dir still exists" || ok "pg dir removed"
for p in "$VERIFY_PORT" "$VERIFY_PG_PORT"; do listening "$p" && bad ":$p still listening" || ok ":$p closed"; done
pgrep -f "$VERIFY_OUT|$VERIFY_STATE" >/dev/null && bad "processes left: $(pgrep -af "$VERIFY_OUT|$VERIFY_STATE")" || ok "no leftover processes"
echo "--- run.sh output tail"; tail -5 "$T/run.txt"
echo "--- VERIFY_OUT: $(ls "$VERIFY_OUT" | tr '\n' ' ')"
[ "$fails" = 0 ] && { echo "ALL PASS"; rm -rf "$T"; } || echo "$fails FAILED (kept $T)"
exit "$fails"
