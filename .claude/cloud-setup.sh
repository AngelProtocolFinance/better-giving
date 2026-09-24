#!/bin/bash
# claude.ai/code cloud environment setup script — pasted verbatim into the
# environment dialog, which is its only runtime; this copy is the record.
# env there: KRU_STORE_REPO=ap-justin/kru-store.
#
# runs as root before claude code launches, with no known repo path, so it
# provisions the vm only; dependencies are cloud-install.sh's (SessionStart).
# the result is cached ~7 days; it must exit zero within ~5 minutes.
set -uo pipefail

# kru store: preferences, plans and seat memory outlive the vm through it.
# kru's store-sync hook pulls it fresh at every session start.
git clone -q https://github.com/ap-justin/kru-store ~/.kru || true
[ -f ~/.kru/setup.sh ] && bash ~/.kru/setup.sh || true

# pnpm 12 is a native binary — no corepack (dropped from node 25+). the
# installer links into $PNPM_HOME/bin via a shell profile the session may
# never source, so it is linked onto the default PATH too. keep the version on
# package.json's `packageManager`.
export PNPM_HOME="$HOME/.local/share/pnpm"
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.4.2 sh - || true
ln -sf "$PNPM_HOME/bin/pnpm" /usr/local/bin/pnpm || true

# vitest browser mode (platform + packages/ui) needs chromium; the browser
# build is tied to the playwright version, so keep it on theirs.
npx -y playwright@1.63.0 install --with-deps chromium || true

exit 0
