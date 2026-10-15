#!/usr/bin/env bash
# stop the instance this skill started and delete its scratch state.
# never kills by process name. never deletes $VERIFY_OUT.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
# shellcheck disable=SC1091
. "$HERE/env.sh"
STACK="$ROOT/.claude/skills/verify-platform/scripts/cleanup.sh"
[ -x "$STACK" ] || { echo "missing cleanup: $STACK" >&2; exit 1; }
exec "$STACK"
