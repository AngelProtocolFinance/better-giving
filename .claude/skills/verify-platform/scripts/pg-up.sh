#!/usr/bin/env bash
# verification scaffolding — throwaway local postgres for verify-platform.
# data dir: $VERIFY_PG_DIR (default /tmp/bg-verify-pg), port $VERIFY_PG_PORT (5433).
# no trust auth and no unix socket: superuser `postgres` is reachable only over
# 127.0.0.1 with a per-cluster random password (scram-sha-256), so another local
# user can't get a superuser session (and with it `COPY ... PROGRAM` as us).
# the password lives in $DIR/verify.pw (data dir is 0700) and is copied to
# $VERIFY_STATE/pg.pass (0600) for launch.sh/doctor.sh. the state dir must be
# private (lib.sh) and pg.pass is never written through a symlink.
set -euo pipefail
umask 077
. "$(dirname "$0")/lib.sh"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -x "$PGBIN/initdb" ] || { echo "postgres not installed: sudo apt-get install -y postgresql" >&2; exit 1; }
DIR=${VERIFY_PG_DIR:-/tmp/bg-verify-pg}; PORT=${VERIFY_PG_PORT:-5433}
STATE=${VERIFY_STATE:-/tmp/bg-verify}; ensure_private_dir "$STATE"
# cleanup.sh deletes $DIR only when this marker is present
MARK="$DIR/.verify-platform-owned"
if [ -e "$DIR" ]; then
  [ -f "$MARK" ] && [ -s "$DIR/verify.pw" ] \
    || { echo "$DIR exists but wasn't created by verify-platform; set VERIFY_PG_DIR to a fresh path" >&2; exit 1; }
else
  write_private_file "$STATE/pg.pass" < <(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')
  "$PGBIN/initdb" -D "$DIR" -U postgres --pwfile="$STATE/pg.pass" --auth=scram-sha-256 -E UTF8 >/dev/null
  echo "created by verify-platform pg-up.sh $(date -u +%FT%TZ)" > "$MARK"
  cp "$STATE/pg.pass" "$DIR/verify.pw"
  echo "host all postgres 127.0.0.1/32 scram-sha-256" > "$DIR/pg_hba.conf"
fi
write_private_file "$STATE/pg.pass" < "$DIR/verify.pw"
export PGPASSWORD; PGPASSWORD=$(cat "$STATE/pg.pass")
if ! "$PGBIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" \
    -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=" -w start >/dev/null
fi
"$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select 1 from pg_database where datname='app'" | grep -q 1 \
  || "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres app
echo "postgres up: postgresql://postgres:***@127.0.0.1:$PORT/app"
