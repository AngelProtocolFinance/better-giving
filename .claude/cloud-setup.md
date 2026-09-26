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
mcp.context7.com
```

## Setup script

```bash
#!/bin/bash
# kru v0.116.0
set -uo pipefail
exec > >(tee -a /tmp/setup.log) 2>&1

try() {
  for _ in 1 2 3; do "$@" && return 0; sleep 2; done
  echo "SETUP FAIL: $*"
}

# kru store
try git clone -q https://github.com/ap-justin/kru-store ~/.kru
[ -f ~/.kru/setup.sh ] && try bash ~/.kru/setup.sh

# node 24
node_tar=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt \
  | grep -o 'node-v24[^ ]*-linux-x64.tar.xz' | head -n 1)
[ -n "$node_tar" ] && try sh -c "curl -fsSL https://nodejs.org/dist/latest-v24.x/$node_tar \
  | tar -xJ -C /usr/local --strip-components=1"
hash -r

# pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
try sh -c 'curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.4.2 SHELL=/bin/bash sh -'
ln -sf "$PNPM_HOME/bin/pnpm" /usr/local/bin/pnpm

# chromium
try npx -y playwright@1.63.0 install --with-deps chromium

# plugins
try claude plugin marketplace add anthropics/claude-plugins-official
try claude plugin marketplace add ap-justin/kru
try claude plugin install kru@kru --scope user
try claude plugin install vercel@claude-plugins-official --scope user

node --version; pnpm --version; claude plugin list
exit 0
```
