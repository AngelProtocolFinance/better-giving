#!/usr/bin/env bash
# stop what launch.sh started (by pid/process group, never by name) and remove
# scratch state. evidence under $VERIFY_OUT is never touched.
# KEEP_DB=1 leaves postgres running for the next launch.
STATE=${VERIFY_STATE:-/tmp/bg-verify}
HERE=$(cd "$(dirname "$0")" && pwd)
if pid=$(cat "$STATE/dev.pid" 2>/dev/null); then
  kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null; echo "stopped dev server group $pid"
  PORT=$(cat "$STATE/port" 2>/dev/null || echo 4200)
  for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null || break; sleep 0.5; done
fi
rm -f "$HERE/../../../../apps/platform/.env.verify"
if [ "${KEEP_DB:-0}" != 1 ]; then
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  DIR=${VERIFY_PG_DIR:-/tmp/bg-verify-pg}
  [ -f "$DIR/PG_VERSION" ] && "$PGBIN/pg_ctl" -D "$DIR" -m fast stop >/dev/null 2>&1 && echo "stopped postgres $DIR"
  rm -rf "$DIR"
fi
rm -rf "$STATE"; echo "cleanup done"
