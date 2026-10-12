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
"$HERE/cleanup.sh" >/dev/null 2>&1
{ "$HERE/launch.sh" && "$HERE/doctor.sh"; } 2>&1 | tee "$VERIFY_OUT/launch-doctor.log"
if [ "${PIPESTATUS[0]}" != 0 ]; then
  cp /tmp/bg-verify/*.log "$VERIFY_OUT/" 2>/dev/null; "$HERE/cleanup.sh"; exit 3
fi
node "$HERE/drive.mjs" "$@" 2>&1 | tee "$VERIFY_OUT/drive.txt"; code=${PIPESTATUS[0]}
cp "${VERIFY_STATE:-/tmp/bg-verify}"/{dev,migrate,stripe-stub}.log "$VERIFY_OUT/" 2>/dev/null
"$HERE/cleanup.sh"
echo "evidence: $VERIFY_OUT ($(ls "$VERIFY_OUT" | wc -l) files) exit=$code"
exit $code
