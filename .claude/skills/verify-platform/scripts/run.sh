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
# from here on, every exit — normal, failure, ^C, kill — runs cleanup once
cleaned=0
finish() { [ "$cleaned" = 1 ] && return; cleaned=1; "$HERE/cleanup.sh"; }
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
{ "$HERE/launch.sh" && "$HERE/doctor.sh"; } 2>&1 | tee "$VERIFY_OUT/launch-doctor.log"
if [ "${PIPESTATUS[0]}" != 0 ]; then
  cp "$STATE"/*.log "$VERIFY_OUT/" 2>/dev/null; exit 3
fi
node "$HERE/drive.mjs" "$@" 2>&1 | tee "$VERIFY_OUT/drive.txt"; code=${PIPESTATUS[0]}
cp "$STATE"/{dev,migrate,stripe-stub}.log "$VERIFY_OUT/" 2>/dev/null
finish
echo "evidence: $VERIFY_OUT ($(ls "$VERIFY_OUT" | wc -l) files) exit=$code"
exit $code
