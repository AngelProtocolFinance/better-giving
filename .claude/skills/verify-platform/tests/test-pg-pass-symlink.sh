#!/usr/bin/env bash
# pg-up.sh / launch.sh must refuse a state dir another local user could have
# planted, and must never write pg.pass through a symlink. needs postgres
# installed (pg-up.sh checks it first); the refusals happen before initdb, so
# no cluster is created except in the last (happy-path) case, which it stops.
# sudo is used for the not-owned case only, and that case is skipped without it.
set -uo pipefail
S=$(cd "$(dirname "$0")/../scripts" && pwd)
T=$(mktemp -d); trap 'chmod -R u+w "$T" 2>/dev/null; sudo -n rm -rf "$T" 2>/dev/null || rm -rf "$T"' EXIT
export VERIFY_PG_PORT=5499
fails=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
# run pg-up with state dir $1 and a fresh pg dir; succeed if it refused with $2
expect_refusal() {
  local name=$1 state=$2 want=$3 pgdir="$T/pg-$RANDOM" out
  out=$(VERIFY_STATE=$state VERIFY_PG_DIR=$pgdir "$S/pg-up.sh" 2>&1) && { bad "$name: pg-up.sh succeeded"; return; }
  grep -q "$want" <<<"$out" || { bad "$name: wrong error: $out"; return; }
  [ -e "$pgdir" ] && { bad "$name: initdb ran anyway"; return; }
  ok "$name ($out)"
}

# 1. pre-planted pg.pass symlink in an otherwise valid private state dir
mkdir -m 700 "$T/s1"; echo "victim contents" > "$T/victim"; ln -s "$T/victim" "$T/s1/pg.pass"
expect_refusal "pg.pass symlink refused" "$T/s1" "it is a symlink"
[ "$(cat "$T/victim")" = "victim contents" ] && [ -L "$T/s1/pg.pass" ] \
  && ok "symlink target untouched" || bad "symlink target was modified"

# 2. dangling symlink (would be created through)
mkdir -m 700 "$T/s2"; ln -s "$T/created-through-link" "$T/s2/pg.pass"
expect_refusal "dangling pg.pass symlink refused" "$T/s2" "it is a symlink"
[ -e "$T/created-through-link" ] && bad "file created through dangling link" || ok "nothing created through dangling link"

# 3. state dir is itself a symlink to a private dir
mkdir -m 700 "$T/real"; ln -s "$T/real" "$T/s3"
expect_refusal "symlinked state dir refused" "$T/s3" "is a symlink"
[ -z "$(ls -A "$T/real")" ] && ok "symlinked dir's target untouched" || bad "wrote into symlinked dir's target"

# 4. state dir with group/other access
mkdir -m 755 "$T/s4"
expect_refusal "0755 state dir refused" "$T/s4" "mode 755, want 700"

# 5. state dir owned by someone else (root), mode 0700
if sudo -n true 2>/dev/null; then
  sudo -n mkdir -m 700 "$T/s5" && sudo -n chown 0:0 "$T/s5"
  expect_refusal "foreign-owned state dir refused" "$T/s5" "not owned by uid"
else
  echo "SKIP foreign-owned state dir (no passwordless sudo)"
fi

# 6. state path is a regular file
echo x > "$T/s6"
expect_refusal "non-directory state path refused" "$T/s6" "not a directory"

# 7. launch.sh refuses too, before touching ports or postgres
out=$(VERIFY_STATE=$T/s3 VERIFY_PORT=4299 "$S/launch.sh" 2>&1) && bad "launch.sh accepted symlinked state dir" \
  || { grep -q "is a symlink" <<<"$out" && ok "launch.sh refuses symlinked state dir" || bad "launch.sh wrong error: $out"; }

# 8. happy path: a missing state dir is created 0700, pg.pass is 0600, and a
# stale regular pg.pass of ours is replaced rather than refused
if out=$(VERIFY_STATE=$T/s8 VERIFY_PG_DIR=$T/pg8 "$S/pg-up.sh" 2>&1); then
  [ "$(stat -c %a "$T/s8")" = 700 ] && [ "$(stat -c %a "$T/s8/pg.pass")" = 600 ] \
    && ok "fresh state dir 0700, pg.pass 0600" || bad "modes: $(stat -c '%n %a' "$T/s8" "$T/s8/pg.pass")"
  echo stale > "$T/s8/pg.pass"
  VERIFY_STATE=$T/s8 VERIFY_PG_DIR=$T/pg8 "$S/pg-up.sh" >/dev/null 2>&1 \
    && cmp -s "$T/s8/pg.pass" "$T/pg8/verify.pw" && ok "stale regular pg.pass replaced on reuse" || bad "reuse with stale pg.pass"
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
  "$PGBIN/pg_ctl" -D "$T/pg8" -m fast -w stop >/dev/null
else
  bad "happy path: $out"
fi

[ "$fails" = 0 ] && echo "ALL PASS" || echo "$fails FAILED"
exit "$fails"
