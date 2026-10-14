#!/usr/bin/env bash
# Install the Node line in .nvmrc and the pnpm version in package.json
# "packageManager", then a frozen-lockfile install. Matches CI:
#   pnpm/action-setup (reads packageManager)
#   actions/setup-node with node-version-file: .nvmrc
#   pnpm install --frozen-lockfile
# Node and pnpm are installed into /usr/local/bin, which is on the default
# PATH. If nvm is already loaded by the login shell (it prepends its own
# bin), the same Node version is selected as nvm's default so that shell
# does not keep an older Node in front.
set -euo pipefail

cd "$(dirname "$0")/.."

spec="$(tr -d '[:space:]' < .nvmrc)"
spec="${spec#v}"

case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64 | arm64) node_arch=arm64 ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if [[ "$spec" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  node_version="$spec"
elif [[ "$spec" =~ ^[0-9]+$ ]]; then
  # A bare major is what .nvmrc holds today ("24"). setup-node resolves
  # that to the current release of the line; do the same from the index.
  node_version="$(
    curl -fsSL https://nodejs.org/dist/index.json |
      python3 -c 'import json,sys; major=sys.argv[1]; rows=json.load(sys.stdin); print(next(r["version"] for r in rows if r["version"].startswith("v"+major+"."))[1:])' "$spec"
  )"
else
  echo "unsupported .nvmrc contents: $spec" >&2
  exit 1
fi

install_node() {
  local version="$1"
  local current=""
  if [[ -x /usr/local/bin/node ]]; then
    current="$(/usr/local/bin/node -v | sed 's/^v//')"
  fi
  if [[ "$current" == "$version" ]]; then
    echo "node ${version} already in /usr/local/bin"
    return
  fi

  local name="node-v${version}-linux-${node_arch}.tar.xz"
  local work
  work="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${version}/${name}" -o "${work}/${name}"
  curl -fsSL "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o "${work}/SHASUMS256.txt"
  (
    cd "$work"
    grep " ${name}$" SHASUMS256.txt | sha256sum -c -
  )
  sudo tar -xJf "${work}/${name}" -C /usr/local --strip-components=1
  rm -rf "$work"
  echo "installed node ${version}"
}

install_node "$node_version"
export PATH="/usr/local/bin:${PATH}"
hash -r

pm="$(/usr/local/bin/node -p "require('./package.json').packageManager")"
case "$pm" in
  pnpm@*) ;;
  *)
    echo "packageManager is ${pm}; this script only installs pnpm" >&2
    exit 1
    ;;
esac

# corepack ships with the Node 24 tarball and reads packageManager, which
# is what CI's pnpm/action-setup does. Non-interactive: do not prompt.
if ! /usr/local/bin/corepack --version >/dev/null 2>&1; then
  echo "node ${node_version} has no corepack" >&2
  exit 1
fi
sudo /usr/local/bin/corepack enable
sudo env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 /usr/local/bin/corepack prepare "$pm" --activate

if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  set +u
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm install "$node_version"
  nvm alias default "$node_version"
  nvm use "$node_version"
  set -u
  hash -r
  if ! command -v corepack >/dev/null 2>&1; then
    echo "nvm's node ${node_version} has no corepack" >&2
    exit 1
  fi
  corepack enable
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "$pm" --activate
fi

echo "node $(/usr/local/bin/node -v)"
echo "pnpm $(/usr/local/bin/pnpm -v)"

# Root "prepare" is `lefthook install`. Lefthook exits 1 when core.hooksPath
# is already set. Cursor cloud agents set that to their own hook directory;
# GitHub Actions does not, so CI's plain `pnpm install --frozen-lockfile`
# succeeds. Move the setting aside for the install, then put it back so
# Cursor's hooks stay in place. Do not pass --reset-hooks-path.
hooks_path="$(git config --local --get core.hooksPath || true)"
restore_hooks() {
  if [[ -n "${hooks_path}" ]]; then
    git config --local core.hooksPath "$hooks_path"
  fi
}
trap restore_hooks EXIT
if [[ -n "$hooks_path" ]]; then
  git config --local --unset-all core.hooksPath
fi

/usr/local/bin/pnpm install --frozen-lockfile
