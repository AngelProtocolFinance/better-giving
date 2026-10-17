#!/usr/bin/env bash
# boot apps/platform for verification: local postgres + migrations + seed +
# `react-router dev --mode verify` on 127.0.0.1:$VERIFY_PORT (default 4200).
# every secret is .env.test filler; DATABASE_URL is local and the neon-local
# preload refuses anything else. writes state to $VERIFY_STATE (/tmp/bg-verify).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
APP="$ROOT/apps/platform"
. "$HERE/lib.sh"
STATE=${VERIFY_STATE:-/tmp/bg-verify}; ensure_private_dir "$STATE"
PORT=${VERIFY_PORT:-4200}; PGPORT=${VERIFY_PG_PORT:-5433}
export PATH="$HOME/.local/node24/bin:$PATH"
export COREPACK_HOME=${COREPACK_HOME_OVERRIDE:-$HOME/.cache/corepack}

if [ -f "$STATE/dev.pid" ] && kill -0 "$(cat "$STATE/dev.pid")" 2>/dev/null; then
  echo "already running (pid $(cat "$STATE/dev.pid")) on :$PORT — run cleanup.sh first"; exit 0
fi
if (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then
  echo "port $PORT is taken by something this skill didn't start; set VERIFY_PORT or stop it" >&2; exit 1
fi

# drive.mjs reads the whole stub log, so a 400 left by an earlier filler-key
# launch would mark this run's flows blocked
rm -f "$STATE/stripe-stub.log" "$STATE/nonprofits-stub.log" "$STATE/blob-stub.log"
"$HERE/pg-up.sh"
# pg-up.sh's per-cluster password (hex, so it needs no url-escaping)
export PGPASSWORD; PGPASSWORD=$(cat "$STATE/pg.pass")
DB="postgresql://postgres:$PGPASSWORD@127.0.0.1:$PGPORT/app"

# optional real stripe TEST keys for the full card flow; live keys refused
for v in VERIFY_STRIPE_SK VERIFY_STRIPE_PK; do
  val=${!v:-}; [ -z "$val" ] && continue
  case "$v:$val" in VERIFY_STRIPE_SK:sk_test_* | VERIFY_STRIPE_PK:pk_test_*) ;;
    *) echo "$v must be a stripe TEST key (sk_test_/pk_test_)" >&2; exit 1 ;; esac
done
if [ -n "${VERIFY_STRIPE_SK:-}" ] && [ -z "${VERIFY_STRIPE_PK:-}" ] || [ -z "${VERIFY_STRIPE_SK:-}" ] && [ -n "${VERIFY_STRIPE_PK:-}" ]; then
  echo "set both VERIFY_STRIPE_SK and VERIFY_STRIPE_PK, or neither" >&2; exit 1; fi

# env for mode `verify`: .env.test filler, with local db + base url. mode files
# beat .env, so a developer's real .env can't leak in. gitignored.
{ grep -vE '^(DATABASE_URL|DATABASE_URL_UNPOOLED|BASE_URL|VITE_BASE_URL|STAGE|VITE_STAGE)=' "$APP/.env.test" \
    | { if [ -n "${VERIFY_STRIPE_SK:-}" ]; then grep -vE '^(STRIPE_SECRET_KEY|VITE_STRIPE_PK)='; else cat; fi; }
  [ -n "${VERIFY_STRIPE_SK:-}" ] && { echo "STRIPE_SECRET_KEY=$VERIFY_STRIPE_SK"; echo "VITE_STRIPE_PK=$VERIFY_STRIPE_PK"; }
  echo "DATABASE_URL=$DB"; echo "DATABASE_URL_UNPOOLED=$DB"
  echo "BASE_URL=http://127.0.0.1:$PORT"; echo "VITE_BASE_URL=http://127.0.0.1:$PORT"
  echo "STAGE=local"; echo "VITE_STAGE=local"; } > "$APP/.env.verify"
chmod 600 "$APP/.env.verify"

# workspace packages ship dist/ that platform imports (e.g. @better-giving/crypto)
(cd "$ROOT" && pnpm exec turbo run build --filter='./packages/*' --output-logs=errors-only >"$STATE/packages-build.log" 2>&1) \
  || { echo "package build failed: $STATE/packages-build.log" >&2; exit 1; }

PRELOAD="--import $HERE/neon-local.mjs --import $HERE/stripe-stub.mjs --import $HERE/nonprofits-stub.mjs --import $HERE/blob-stub.mjs"
(cd "$APP" && DATABASE_URL=$DB DATABASE_URL_UNPOOLED=$DB node $PRELOAD .server/pg/migrate.ts) >"$STATE/migrate.log" 2>&1 \
  || { echo "migrate failed: $STATE/migrate.log" >&2; exit 1; }
PSQL=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)/psql
NPO_ID=$("$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres app -qtAf "$HERE/seed.sql" | tail -1)
echo "$NPO_ID" > "$STATE/npo_id"

cd "$APP"
DATABASE_URL=$DB STRIPE_SECRET_KEY=$(grep -m1 "^STRIPE_SECRET_KEY=" "$APP/.env.verify" | cut -d= -f2-) NONPROFITS_API_KEY=$(grep -m1 "^NONPROFITS_API_KEY=" "$APP/.env.verify" | cut -d= -f2-) BLOB_READ_WRITE_TOKEN=$(grep -m1 "^BLOB_READ_WRITE_TOKEN=" "$APP/.env.verify" | cut -d= -f2-) VERIFY_STATE=$STATE NODE_OPTIONS="$PRELOAD" VERIFY_WS_PORT=${VERIFY_WS_PORT:-5488} \
  setsid nohup pnpm exec react-router dev --mode verify --host 127.0.0.1 --port "$PORT" >"$STATE/dev.log" 2>&1 &
echo $! > "$STATE/dev.pid"; echo "$PORT" > "$STATE/port"
# start time (/proc stat field 22) pins the pid's identity for cleanup.sh; if
# the server already died it stays empty and the readiness loop reports it
{ sed 's/.*) //' "/proc/$!/stat" 2>/dev/null | cut -d' ' -f20; } > "$STATE/dev.starttime" || true

for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 120 "http://127.0.0.1:$PORT/" || true)
  [ "$code" = 200 ] && { echo "ready http://127.0.0.1:$PORT (pid $(cat "$STATE/dev.pid"), npo $NPO_ID, log $STATE/dev.log)"; exit 0; }
  kill -0 "$(cat "$STATE/dev.pid")" 2>/dev/null || { echo "dev server exited; see $STATE/dev.log" >&2; exit 1; }
  sleep 2
done
echo "not ready after 180s; see $STATE/dev.log" >&2; exit 1
