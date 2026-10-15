# shared defaults for this skill. sourced, not executed.
# one instance at a time: port 4200 is the app's strictPort, and launch writes
# a single apps/platform/.env.verify. a second run sets VERIFY_PORT,
# VERIFY_PG_PORT, VERIFY_WS_PORT, VERIFY_STATE, and VERIFY_PG_DIR together.
export PATH="${HOME}/.local/node24/bin:/usr/local/bin:${PATH}"
export COREPACK_HOME="${COREPACK_HOME_OVERRIDE:-${HOME}/.cache/corepack}"
export VERIFY_STATE="${VERIFY_STATE:-/tmp/bg-verify-cursor}"
export VERIFY_PG_DIR="${VERIFY_PG_DIR:-/tmp/bg-verify-cursor-pg}"
export VERIFY_PORT="${VERIFY_PORT:-4200}"
export VERIFY_PG_PORT="${VERIFY_PG_PORT:-5433}"
export VERIFY_WS_PORT="${VERIFY_WS_PORT:-5488}"
export VERIFY_OUT
VERIFY_OUT="$(realpath -m "${VERIFY_OUT:-/tmp/verify-platform-cursor-out}")"
