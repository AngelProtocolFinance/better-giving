# Cloud environment

The claude.ai/code environment for this repo. The dialog holds these three values and nothing records them but this file, so change them here first, then paste.

## Environment variables

```
KRU_STORE_REPO=ap-justin/kru-store
```

## Network access

**Custom**, with "include defaults" on, plus:

```
get.pnpm.io
cdn.playwright.dev
playwright.download.prss.microsoft.com
```

The Trusted list lacks these three: the pnpm installer and Playwright's browser downloads.

## Plugins

Enabled on the claude.ai account (kru, vercel), not here: a cloud session ignores the repo's `enabledPlugins` and downloads the account's plugins as `<name>@synced` at every session start. Ask a cloud session to run `claude plugin list` to confirm they loaded.

## Setup script

Runs as root before Claude Code launches, with no known repo path, so it provisions the VM only. Dependencies install from `.claude/cloud-install.sh`, a SessionStart hook. The result is cached for about 7 days, and the script must exit zero within about 5 minutes. `|| true` hides a blocked host, so the script ends by printing the versions: check them in the first session's setup log.

- **kru store**: preferences, plans and seat memory outlive the VM through it; kru's store-sync hook pulls it fresh at every session start. The GitHub proxy scopes credentials to repositories attached to the session, so this clone of a private repo is unverified.
- **node 24**: the image ships Node 20-22; `package.json`'s `engines` is 24.x.
- **pnpm**: the native binary, not corepack (dropped from Node 25+). The installer verifies its signature, then runs `pnpm setup`, which writes a shell profile. The setup script runs without a login shell, so it passes `SHELL=/bin/bash`; the session may never source that profile, hence the symlink. Keep the version on `package.json`'s `packageManager`.
- **chromium**: for vitest browser mode (platform + `packages/ui`). The browser build is tied to the Playwright version, so keep it on theirs.

```bash
#!/bin/bash
set -uo pipefail

# kru store
git clone -q https://github.com/ap-justin/kru-store ~/.kru || true
[ -f ~/.kru/setup.sh ] && bash ~/.kru/setup.sh || true

# node 24
node_tar=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt \
  | grep -o 'node-v24[^ ]*-linux-x64.tar.xz' | head -n 1)
[ -n "$node_tar" ] && curl -fsSL "https://nodejs.org/dist/latest-v24.x/$node_tar" \
  | tar -xJ -C /usr/local --strip-components=1 || true
hash -r

# pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.4.2 SHELL=/bin/bash sh - || true
ln -sf "$PNPM_HOME/bin/pnpm" /usr/local/bin/pnpm || true

# chromium
npx -y playwright@1.63.0 install --with-deps chromium || true

node --version; pnpm --version
exit 0
```
