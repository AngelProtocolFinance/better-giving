#!/usr/bin/env bash
# read-only: is the instance this skill started worth driving? exit 0 = yes.
export PATH="$HOME/.local/node24/bin:$PATH"
HERE=$(cd "$(dirname "$0")" && pwd)
STATE=${VERIFY_STATE:-/tmp/bg-verify}; ok=0
PORT=$(cat "$STATE/port" 2>/dev/null || echo "${VERIFY_PORT:-4200}")
pid=$(cat "$STATE/dev.pid" 2>/dev/null)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "ok   dev server pid $pid (ours)"; else echo "FAIL no dev server started by launch.sh"; ok=1; fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "http://127.0.0.1:$PORT/")
[ "$code" = 200 ] && echo "ok   GET / → 200 on :$PORT" || { echo "FAIL GET / → $code on :$PORT"; ok=1; }
PSQL=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)/psql
n=$(PGPASSWORD=$(cat "$STATE/pg.pass" 2>/dev/null) "$PSQL" -h 127.0.0.1 -p "${VERIFY_PG_PORT:-5433}" -U postgres app -tAc "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null)
[ -n "$n" ] && echo "ok   local postgres, $n migrations applied" || { echo "FAIL local postgres unreachable"; ok=1; }
grep -q '^DATABASE_URL=postgresql://postgres:[0-9a-f]*@127.0.0.1:' "$HERE/../../../../apps/platform/.env.verify" 2>/dev/null \
  && echo "ok   .env.verify points at local db" || { echo "FAIL .env.verify missing or non-local db"; ok=1; }
if node "$HERE/drive.mjs" --check-map; then
  :
else
  echo "FAIL features/, README links, and drive.mjs disagree"
  ok=1
fi
exit $ok
