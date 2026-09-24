# Cloud environment

## Environment variables

```
KRU_STORE_REPO=ap-justin/kru-store
```

## Network access

Custom, "include defaults" on, plus:

```
get.pnpm.io
cdn.playwright.dev
playwright.download.prss.microsoft.com
ppa.launchpadcontent.net
```

## Setup script

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

# plugins
claude plugin marketplace add ap-justin/kru || true
claude plugin install kru@kru --scope user || true
claude plugin install vercel@claude-plugins-official --scope user || true
claude plugin list || true

node --version; pnpm --version
exit 0
```
