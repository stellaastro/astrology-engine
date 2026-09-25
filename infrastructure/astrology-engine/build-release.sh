#!/usr/bin/env bash
# Build a self-contained release of the astrology engine.
#
#   infrastructure/astrology-engine/build-release.sh <name>
#     → <repo>/dist-release-astrology-engine-<name>/{dist,node_modules,package.json,…}
#
# The release carries its own node_modules (sweph only), so it does not depend
# on the monorepo's install, and a build-info.json naming the commit it was
# built from — the commit whose source must be published (AGPL §13). So the
# engine directory must be committed: a dirty tree would run code no commit has.
set -euo pipefail
name="${1:?usage: build-release.sh <name>}"
repo="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
engine="$repo/services/astrology-engine"
out="${RELEASE_ROOT:-$repo}/dist-release-astrology-engine-$name"

if [ -n "$(git -C "$repo" status --porcelain -- services/astrology-engine)" ]; then
  echo "services/astrology-engine has uncommitted changes; commit first so the release matches a publishable commit." >&2
  exit 1
fi
[ -e "$out" ] && { echo "$out already exists; releases are never overwritten." >&2; exit 1; }

commit="$(git -C "$repo" rev-parse HEAD)"
mkdir -p "$out"
(cd "$engine" && npx tsc -p tsconfig.build.json --outDir "$out/dist")
cp "$engine"/{package.json,package-lock.json,ephemeris-manifest.json,LICENSE,README.md} "$out/"
printf '{\n  "commit": "%s",\n  "builtAt": "%s"\n}\n' "$commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$out/build-info.json"
(cd "$out" && npm ci --omit=dev --no-audit --no-fund --ignore-scripts=false >/dev/null)
# npm leaves empty scope directories for the omitted dev packages.
find "$out/node_modules" -mindepth 1 -maxdepth 1 -type d -empty -delete
node -e "require('$out/node_modules/sweph'); console.log('sweph loads from the release')"
echo "built $out from $commit"
