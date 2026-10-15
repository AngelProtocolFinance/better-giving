#!/usr/bin/env bash
# start apps/platform for verification and return when GET / is 200.
# delegates to the repo's throwaway-postgres launcher. that launcher is what
# reaches a usable app from an empty data dir with only committed filler
# secrets: local postgres, migrations, seed, then react-router dev --mode verify.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
# shellcheck disable=SC1091
. "$HERE/env.sh"
STACK="$ROOT/.claude/skills/verify-platform/scripts/launch.sh"
[ -x "$STACK" ] || { echo "missing launcher: $STACK" >&2; exit 1; }
exec "$STACK"
