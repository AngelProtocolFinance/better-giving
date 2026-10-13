#!/usr/bin/env bash
# one shot: launch → doctor → drive → cleanup. evidence lands in $VERIFY_OUT
# (default ./verify-out) and survives cleanup. exit code is drive.mjs's
# (0 pass, 1 fail, 2 blocked-only), or 3 if launch/doctor failed.
#   scripts/run.sh                 # all flows
#   scripts/run.sh home donate-card
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
export PATH="$HOME/.local/node24/bin:$PATH"
export VERIFY_OUT=$(realpath -m "${VERIFY_OUT:-verify-out}")
mkdir -p "$VERIFY_OUT"
export VERIFY_GIT="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null)$(git -C "$HERE" diff --quiet HEAD 2>/dev/null || echo '+dirty')"
STATE=${VERIFY_STATE:-/tmp/bg-verify}
# leftovers from an earlier run; a refusal (foreign VERIFY_PG_DIR, db that won't
# stop) aborts before anything is launched
"$HERE/cleanup.sh" >/dev/null || { echo "pre-launch cleanup refused (see above)" >&2; exit 3; }
# from here on, every exit — normal, failure, ^C, kill — copies the server logs
# into $VERIFY_OUT and then runs cleanup (which deletes $STATE), once
cleaned=0; child=
stop_child() {
  [ -n "$child" ] && kill -0 "$child" 2>/dev/null || return 0
  # a step leads its own process group (setsid below): TERM the whole group,
  # so playwright closes chromium and launch.sh stops mid-step
  kill -TERM -- "-$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$child" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$child" 2>/dev/null
  wait "$child" 2>/dev/null; child=
}
finish() {
  [ "$cleaned" = 1 ] && return; cleaned=1
  stop_child
  cp "$STATE"/*.log "$VERIFY_OUT/" 2>/dev/null
  "$HERE/cleanup.sh"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# run a step in the background and `wait` on it: bash defers traps until a
# foreground command returns, but `wait` returns as soon as a signal lands.
# the step's stdout+stderr are tee'd to $1; returns the step's exit code.
step() {
  local log=$1; shift
  setsid bash -o pipefail -c '"${@:2}" 2>&1 | tee "$1"' _ "$log" "$@" &
  child=$!; wait "$child"; local rc=$?; child=; return $rc
}
step "$VERIFY_OUT/launch-doctor.log" bash -c '"$1/launch.sh" && "$1/doctor.sh"' _ "$HERE" || exit 3
step "$VERIFY_OUT/drive.txt" node "$HERE/drive.mjs" "$@"; code=$?
finish
echo "evidence: $VERIFY_OUT ($(ls "$VERIFY_OUT" | wc -l) files) exit=$code"
exit $code
