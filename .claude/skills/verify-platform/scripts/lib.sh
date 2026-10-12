# shellcheck shell=bash
# sourced by launch.sh / pg-up.sh. the state dir holds the db password, pids
# and logs, and defaults to a fixed path in shared /tmp, so another local user
# could pre-plant it (or a symlink inside it) to redirect our writes.

# create $1 as a private dir, or accept an existing one only if it is a real
# directory (not a symlink), owned by us, mode 0700. exits 1 otherwise.
ensure_private_dir() {
  local d=$1
  if [ -L "$d" ]; then
    echo "refusing state dir $d: it is a symlink" >&2; exit 1
  elif [ -e "$d" ]; then
    [ -d "$d" ] || { echo "refusing state dir $d: not a directory" >&2; exit 1; }
    [ "$(stat -c %u "$d")" = "$(id -u)" ] || { echo "refusing state dir $d: not owned by uid $(id -u)" >&2; exit 1; }
    [ "$(stat -c %a "$d")" = 700 ] || { echo "refusing state dir $d: mode $(stat -c %a "$d"), want 700" >&2; exit 1; }
  else
    mkdir -p "$(dirname "$d")"
    # no -p: fails rather than adopting a dir someone else created in the gap
    mkdir -m 700 "$d" || { echo "refusing state dir $d: could not create it" >&2; exit 1; }
  fi
}

# write stdin to $1 as a new 0600 file without following a symlink: refuse a
# symlink, drop a regular file of ours, then create with noclobber (O_EXCL).
write_private_file() {
  local f=$1
  [ -L "$f" ] && { echo "refusing to write $f: it is a symlink" >&2; exit 1; }
  if [ -e "$f" ]; then
    [ -f "$f" ] && [ "$(stat -c %u "$f")" = "$(id -u)" ] \
      || { echo "refusing to write $f: not a regular file owned by uid $(id -u)" >&2; exit 1; }
    rm -f "$f"
  fi
  (umask 077; set -C; cat > "$f") || { echo "refusing to write $f: it reappeared" >&2; exit 1; }
}
