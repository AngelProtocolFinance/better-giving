#!/usr/bin/env bash
# verification scaffolding — throwaway local postgres for verify-platform.
# data dir: $VERIFY_PG_DIR (default /tmp/bg-verify-pg), port $VERIFY_PG_PORT (5433).
set -euo pipefail
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -x "$PGBIN/initdb" ] || { echo "postgres not installed: sudo apt-get install -y postgresql" >&2; exit 1; }
DIR=${VERIFY_PG_DIR:-/tmp/bg-verify-pg}; PORT=${VERIFY_PG_PORT:-5433}
if [ ! -f "$DIR/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$DIR" -U postgres --auth=trust -E UTF8 >/dev/null
fi
if ! "$PGBIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -w start >/dev/null
fi
"$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select 1 from pg_database where datname='app'" | grep -q 1 \
  || "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres app
echo "postgres up: postgresql://postgres@127.0.0.1:$PORT/app"
