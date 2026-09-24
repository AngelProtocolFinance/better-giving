#!/bin/bash
# SessionStart hook (.claude/settings.json). the environment snapshot holds
# what the setup script (cloud-setup.md) wrote, not node_modules, so every
# cloud session installs against its own branch's lockfile.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

# the image's /opt/node22/bin (node 22, pnpm 10) sits ahead of /usr/local/bin,
# where the setup script puts node 24 and the native pnpm. pnpm 10 would fetch
# `packageManager`'s version into .tools with lifecycle scripts off, leaving a
# shebang-less placeholder that turbo can't spawn (ENOEXEC). put ours first,
# here and for the session's shell.
export PATH="/usr/local/bin:$PATH"
[ -n "${CLAUDE_ENV_FILE:-}" ] &&
  echo 'export PATH="/usr/local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"

pnpm install --frozen-lockfile || true
exit 0
