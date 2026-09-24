#!/bin/bash
# SessionStart hook (.claude/settings.json). the environment snapshot holds
# what cloud-setup.sh wrote, not node_modules, so every cloud session installs
# against its own branch's lockfile.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
pnpm install --frozen-lockfile || true
exit 0
