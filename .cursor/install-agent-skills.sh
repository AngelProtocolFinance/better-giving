#!/usr/bin/env bash
# Install kru-cursor and pstack where Cursor discovers project skills and
# subagents from the checkout:
#   https://cursor.com/docs/skills — <repo>/.cursor/skills
#   https://cursor.com/docs/subagents — <repo>/.cursor/agents
# The same trees are also copied to ~/.cursor/skills and ~/.cursor/agents.
# .cursor/skills and .cursor/agents are gitignored; nothing from the clones
# is committed.
#
# The saved cloud environment for this repo is db-backed and does not read
# the branch's .cursor/environment.json (it is only `bash .cursor/install.sh`,
# with no `start`). .cursor/hooks.json runs this script on beforeSubmitPrompt,
# which Cursor calls before the backend request that builds the skill list.
# environment.json `install` and `start` call it too, for a boot whose saved
# config actually includes them. Always tracks origin/main.
# A network or git failure logs a warning and exits 0. An existing checkout is
# kept when a refresh fails, so a blip does not remove skills already on disk.
set -u

export GIT_TERMINAL_PROMPT=0

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cache="${HOME}/.cache/better-giving/agent-skills"
# Project dirs are what a cloud agent loads from the checkout. Home dirs are
# the user-level locations from the same docs.
project_skills="${repo_root}/.cursor/skills"
project_agents="${repo_root}/.cursor/agents"
home_skills="${HOME}/.cursor/skills"
home_agents="${HOME}/.cursor/agents"
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
    if ! timeout 40 git clone --depth 1 --filter=blob:none --sparse --branch main "$url" "$dest"; then
      warn "clone failed for ${url}"
      rm -rf "$dest"
      return 1
    fi
  elif ! timeout 20 git -C "$dest" fetch --depth 1 origin main; then
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

# Install one source's *.md into $dest_root. Only that group's previous files
# in that directory are replaced, so a failed sync of the other source leaves
# its agents.
install_agent_group() {
  local group="$1"
  local src="$2"
  local dest_root="$3"
  local name group_file found=0
  local staged="${dest_root}/.better-giving-staged-${group}"
  local manifest="${dest_root}/.better-giving-managed"

  if [[ ! -d "$src" ]]; then
    warn "missing ${src}; leaving ${group} agents unchanged"
    return 1
  fi

  mkdir -p "$dest_root"
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
      rm -f "${dest_root}/${name}"
    done <"$group_file"
  fi

  : >"${group_file}.next"
  shopt -s nullglob
  for path in "$staged"/*.md; do
    name="$(basename "$path")"
    if [[ -e "${dest_root}/${name}" ]]; then
      warn "not replacing existing ${dest_root}/${name} (collision with ${group})"
      continue
    fi
    cp -a "$path" "${dest_root}/${name}"
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

install_skill_tree() {
  local name="$1"
  local src="$2"
  replace_tree "$src" "${project_skills}/${name}" || warn "${name} project skills were not updated"
  replace_tree "$src" "${home_skills}/${name}" || warn "${name} home skills were not updated"
}

if [[ "$kru_ok" -eq 1 ]]; then
  install_skill_tree kru-cursor "${kru_dest}/skills"
fi
if [[ "$plugins_ok" -eq 1 ]]; then
  install_skill_tree pstack "${plugins_dest}/pstack/skills"
fi

if [[ "$kru_ok" -eq 1 ]]; then
  install_agent_group kru "${kru_dest}/agents" "$project_agents" || warn "kru-cursor project agents were not updated"
  install_agent_group kru "${kru_dest}/agents" "$home_agents" || warn "kru-cursor home agents were not updated"
fi
if [[ "$plugins_ok" -eq 1 ]]; then
  install_agent_group pstack "${plugins_dest}/pstack/agents" "$project_agents" || warn "pstack project agents were not updated"
  install_agent_group pstack "${plugins_dest}/pstack/agents" "$home_agents" || warn "pstack home agents were not updated"
fi

if [[ -d "$project_skills" ]]; then
  skill_count="$(find "$project_skills" -name SKILL.md -type f | wc -l | tr -d ' ')"
  log "skills in ${project_skills}: ${skill_count}"
else
  warn "no skills installed under ${project_skills}"
fi

exit 0
