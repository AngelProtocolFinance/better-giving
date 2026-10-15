#!/usr/bin/env bash
# launch → doctor → drive → cleanup. proof stays in $VERIFY_OUT.
#   scripts/run.sh                  # every mapped feature
#   scripts/run.sh landing sign-in  # named features
# exit: 0 pass · 1 a feature failed · 2 only unreachable · 3 launch/doctor failed
#       or cleanup removed the proof.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$HERE/env.sh"
mkdir -p "$VERIFY_OUT"
export VERIFY_GIT
VERIFY_GIT="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null)$(git -C "$HERE" diff --quiet HEAD 2>/dev/null || echo '+dirty')"
STATE=$VERIFY_STATE
"$HERE/cleanup.sh" >/dev/null || { echo "pre-launch cleanup refused" >&2; exit 3; }
cleaned=0
child=
drove=0
stop_child() {
  [ -n "$child" ] && kill -0 "$child" 2>/dev/null || return 0
  kill -TERM -- "-$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$child" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$child" 2>/dev/null
  wait "$child" 2>/dev/null
  child=
}
finish() {
  [ "$cleaned" = 1 ] && return
  cleaned=1
  stop_child
  cp "$STATE"/*.log "$VERIFY_OUT/" 2>/dev/null || true
  "$HERE/cleanup.sh" || echo "cleanup failed; scratch state may remain at $STATE" >&2
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
step() {
  local log=$1
  shift
  setsid bash -o pipefail -c '"${@:2}" 2>&1 | tee "$1"' _ "$log" "$@" &
  child=$!
  wait "$child"
  local rc=$?
  child=
  return "$rc"
}
step "$VERIFY_OUT/launch-doctor.log" bash -c '"$1/launch.sh" && "$1/doctor.sh"' _ "$HERE" || exit 3
step "$VERIFY_OUT/drive.txt" node "$HERE/drive.mjs" "$@"
code=$?
drove=1
finish
if [ ! -s "$VERIFY_OUT/results.json" ]; then
  echo "proof missing after cleanup: $VERIFY_OUT/results.json" >&2
  exit 3
fi
echo "evidence: $VERIFY_OUT ($(ls "$VERIFY_OUT" | wc -l) files) exit=$code"
exit "$code"
