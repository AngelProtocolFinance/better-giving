#!/usr/bin/env bash
# stop what launch.sh started (by pid/process group, never by name) and remove
# scratch state. evidence under $VERIFY_OUT is never touched.
# KEEP_DB=1 leaves postgres running for the next launch.
# deletes $VERIFY_PG_DIR only if pg-up.sh's ownership marker is in it, and only
# after postgres is confirmed stopped; otherwise exits 1 and leaves it intact.
STATE=${VERIFY_STATE:-/tmp/bg-verify}
HERE=$(cd "$(dirname "$0")" && pwd)
if pid=$(cat "$STATE/dev.pid" 2>/dev/null); then
  kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null; echo "stopped dev server group $pid"
  PORT=$(cat "$STATE/port" 2>/dev/null || echo 4200)
  for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null || break; sleep 0.5; done
fi
rm -f "$HERE/../../../../apps/platform/.env.verify"
if [ "${KEEP_DB:-0}" != 1 ]; then
  DIR=${VERIFY_PG_DIR:-/tmp/bg-verify-pg}
  if [ -e "$DIR" ]; then
    [ -f "$DIR/.verify-platform-owned" ] \
      || { echo "refusing to delete $DIR: no .verify-platform-owned marker (not created by pg-up.sh)" >&2; exit 1; }
    PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
    if [ -f "$DIR/PG_VERSION" ]; then
      [ -x "$PGBIN/pg_ctl" ] || { echo "can't find pg_ctl to stop $DIR; not deleting it" >&2; exit 1; }
      if "$PGBIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
        "$PGBIN/pg_ctl" -D "$DIR" -m fast -w stop >/dev/null 2>&1 \
          || { echo "pg_ctl stop failed for $DIR; not deleting it" >&2; exit 1; }
        echo "stopped postgres $DIR"
      fi
    fi
    rm -rf "$DIR"
  fi
fi
rm -rf "$STATE"; echo "cleanup done"
