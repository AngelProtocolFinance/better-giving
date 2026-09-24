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
# here and for the session's shell. this prepends all of /usr/local/bin, so
# its python and ruby also win over the image's.
export PATH="/usr/local/bin:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qxF 'export PATH="/usr/local/bin:$PATH"' "$CLAUDE_ENV_FILE" 2>/dev/null; then
  echo 'export PATH="/usr/local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

# a failed install must not block session start.
pnpm install --frozen-lockfile || echo "cloud-install.sh: pnpm install failed, continuing" >&2
exit 0
