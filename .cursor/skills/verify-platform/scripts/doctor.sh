#!/usr/bin/env bash
# read-only: is the instance launch.sh started worth driving? exit 0 = yes.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
# shellcheck disable=SC1091
. "$HERE/env.sh"
ok=0
fail() { echo "FAIL $*"; ok=1; }

pid=$(cat "$VERIFY_STATE/dev.pid" 2>/dev/null || true)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  echo "ok   dev server pid $pid (ours, $VERIFY_STATE)"
else
  fail "no live dev server recorded in $VERIFY_STATE/dev.pid"
fi

port=$(cat "$VERIFY_STATE/port" 2>/dev/null || echo "$VERIFY_PORT")
if [ "$port" != "$VERIFY_PORT" ]; then
  fail "state port $port != VERIFY_PORT $VERIFY_PORT"
else
  echo "ok   state port $port"
fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "http://127.0.0.1:$port/" || true)
if [ "$code" = 200 ]; then
  echo "ok   GET / → 200 on :$port"
else
  fail "GET / → ${code:-none} on :$port"
fi

pgbin=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
psql="$pgbin/psql"
if [ ! -x "$psql" ]; then
  fail "psql not found (install the postgresql package)"
else
  n=$(PGPASSWORD="$(cat "$VERIFY_STATE/pg.pass" 2>/dev/null || true)" "$psql" -h 127.0.0.1 -p "$VERIFY_PG_PORT" -U postgres app -tAc "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || true)
  if [ -n "$n" ]; then
    echo "ok   local postgres :$VERIFY_PG_PORT, $n migrations applied"
  else
    fail "local postgres unreachable on :$VERIFY_PG_PORT"
  fi
fi

envfile="$ROOT/apps/platform/.env.verify"
if grep -q "^DATABASE_URL=postgresql://postgres:[0-9a-f]*@127.0.0.1:${VERIFY_PG_PORT}/" "$envfile" 2>/dev/null; then
  echo "ok   .env.verify points at local postgres"
else
  fail ".env.verify missing or not the local database"
fi

if node "$HERE/drive.mjs" --check-map; then
  :
else
  fail "feature map does not match drive.mjs"
fi

exit "$ok"
