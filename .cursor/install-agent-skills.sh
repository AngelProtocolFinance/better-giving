#!/usr/bin/env bash
# Install kru-cursor and pstack skills where Cursor loads user-level skills:
# https://cursor.com/docs/skills — ~/.cursor/skills (walked recursively).
# Subagent markdown from the same checkouts goes to ~/.cursor/agents:
# https://cursor.com/docs/subagents
#
# Called from .cursor/environment.json `install` (so a build snapshot already
# has the files when the agent process starts) and `start` (every boot, because
# agents that boot from a snapshot skip `install`). Always tracks origin/main.
# A network or git failure logs a warning and exits 0. An existing checkout is
# kept when a refresh fails, so a blip does not remove skills already on disk.
set -u

export GIT_TERMINAL_PROMPT=0

cache="${HOME}/.cache/better-giving/agent-skills"
skills_root="${HOME}/.cursor/skills"
agents_root="${HOME}/.cursor/agents"
manifest="${agents_root}/.better-giving-managed"
lock_file="${cache}/.lock"

warn() {
  printf 'warning: %s\n' "$*" >&2
}

log() {
  printf '%s\n' "$*"
}

mkdir -p "$cache"
exec 9>"$lock_file"
if ! flock -w 90 9; then
  warn "could not lock ${lock_file}; leaving skills unchanged"
  exit 0
fi

# Refresh a shallow sparse clone of origin/main. Returns 0 when $dest is usable.
sync_sparse() {
  local url="$1"
  local dest="$2"
  shift 2

  if [[ ! -d "${dest}/.git" ]]; then
    rm -rf "$dest"
    if ! timeout 90 git clone --depth 1 --filter=blob:none --sparse --branch main "$url" "$dest"; then
      warn "clone failed for ${url}"
      rm -rf "$dest"
      return 1
    fi
  elif ! timeout 60 git -C "$dest" fetch --depth 1 origin main; then
    warn "fetch failed for ${url}; keeping the previous checkout"
  elif ! git -C "$dest" reset --hard FETCH_HEAD; then
    warn "reset failed for ${url}; keeping the previous checkout"
  fi

  if [[ ! -d "${dest}/.git" ]]; then
    return 1
  fi
  if ! git -C "$dest" sparse-checkout set -- "$@"; then
    warn "sparse-checkout failed for ${url}"
    return 1
  fi
  return 0
}

# Replace $dest with a copy of $src. $dest is removed only after the copy succeeds.
replace_tree() {
  local src="$1"
  local dest="$2"
  local parent tmp backup

  if [[ ! -d "$src" ]]; then
    warn "missing ${src}; leaving ${dest} unchanged"
    return 1
  fi
  parent="$(dirname "$dest")"
  mkdir -p "$parent"
  tmp="$(mktemp -d "${parent}/.skill-tmp.XXXXXX")"
  if ! cp -a "${src}/." "$tmp/"; then
    warn "copy failed for ${src}"
    rm -rf "$tmp"
    return 1
  fi
  backup="${dest}.replacing"
  rm -rf "$backup"
  if [[ -d "$dest" ]]; then
    mv "$dest" "$backup"
  fi
  if ! mv "$tmp" "$dest"; then
    warn "could not move ${src} into ${dest}"
    if [[ -d "$backup" ]]; then
      mv "$backup" "$dest"
    fi
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$backup"
}

# Install one source's *.md into ~/.cursor/agents. Only that group's previous
# files are replaced, so a failed sync of the other source leaves its agents.
install_agent_group() {
  local group="$1"
  local src="$2"
  local name group_file found=0
  local staged="${agents_root}/.better-giving-staged-${group}"

  if [[ ! -d "$src" ]]; then
    warn "missing ${src}; leaving ${group} agents unchanged"
    return 1
  fi

  mkdir -p "$agents_root"
  rm -rf "$staged"
  mkdir -p "$staged"
  shopt -s nullglob
  for path in "$src"/*.md; do
    found=1
    name="$(basename "$path")"
    cp -a "$path" "${staged}/${name}"
  done
  shopt -u nullglob
  if [[ "$found" -eq 0 ]]; then
    warn "no agent markdown in ${src}; leaving ${group} agents unchanged"
    rm -rf "$staged"
    return 1
  fi

  group_file="${manifest}.${group}"
  if [[ -f "$group_file" ]]; then
    while IFS= read -r name || [[ -n "${name:-}" ]]; do
      [[ -n "$name" ]] || continue
      rm -f "${agents_root}/${name}"
    done <"$group_file"
  fi

  : >"${group_file}.next"
  shopt -s nullglob
  for path in "$staged"/*.md; do
    name="$(basename "$path")"
    if [[ -e "${agents_root}/${name}" ]]; then
      warn "not replacing existing ${agents_root}/${name} (collision with ${group})"
      continue
    fi
    cp -a "$path" "${agents_root}/${name}"
    printf '%s\n' "$name" >>"${group_file}.next"
  done
  shopt -u nullglob
  mv "${group_file}.next" "$group_file"
  rm -rf "$staged"
}

kru_url="https://github.com/salasjustin/kru-cursor"
plugins_url="https://github.com/cursor/plugins"
kru_dest="${cache}/kru-cursor"
plugins_dest="${cache}/cursor-plugins"

kru_ok=0
plugins_ok=0
if sync_sparse "$kru_url" "$kru_dest" skills agents; then
  kru_ok=1
  log "kru-cursor $(git -C "$kru_dest" rev-parse --short HEAD)"
fi
if sync_sparse "$plugins_url" "$plugins_dest" pstack; then
  plugins_ok=1
  log "cursor/plugins $(git -C "$plugins_dest" rev-parse --short HEAD)"
fi

if [[ "$kru_ok" -eq 1 ]]; then
  replace_tree "${kru_dest}/skills" "${skills_root}/kru-cursor" || warn "kru-cursor skills were not updated"
fi
if [[ "$plugins_ok" -eq 1 ]]; then
  replace_tree "${plugins_dest}/pstack/skills" "${skills_root}/pstack" || warn "pstack skills were not updated"
fi

if [[ "$kru_ok" -eq 1 ]]; then
  install_agent_group kru "${kru_dest}/agents" || warn "kru-cursor agents were not updated"
fi
if [[ "$plugins_ok" -eq 1 ]]; then
  install_agent_group pstack "${plugins_dest}/pstack/agents" || warn "pstack agents were not updated"
fi

if [[ -d "$skills_root" ]]; then
  skill_count="$(find "$skills_root" -name SKILL.md -type f | wc -l | tr -d ' ')"
  log "skills in ${skills_root}: ${skill_count}"
else
  warn "no skills installed under ${skills_root}"
fi

exit 0
