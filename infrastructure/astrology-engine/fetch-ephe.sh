#!/usr/bin/env bash
# Fetch the Swiss Ephemeris data files the engine is pinned to, and verify them.
#
#   infrastructure/astrology-engine/fetch-ephe.sh [target-dir]   (default /home/stellaastro/ephe)
#
# The commit and checksums come from services/astrology-engine/ephemeris-manifest.json,
# the same file the engine checks at boot. A file that does not match is deleted
# and the script fails: the engine would refuse to start on it anyway.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest="$here/../../services/astrology-engine/ephemeris-manifest.json"
target="${1:-/home/stellaastro/ephe}"

commit="$(node -e 'console.log(require(process.argv[1]).commit)' "$manifest")"
mkdir -p "$target"

node -e 'const m=require(process.argv[1]); for (const [f,h] of Object.entries(m.files)) console.log(f, h)' "$manifest" |
while read -r file expected; do
  url="https://raw.githubusercontent.com/aloistr/swisseph/$commit/ephe/$file"
  if [ -f "$target/$file" ] && [ "$(sha256sum "$target/$file" | cut -d' ' -f1)" = "$expected" ]; then
    echo "ok       $file (already present)"
    continue
  fi
  tmp="$(mktemp "$target/.$file.XXXXXX")"
  curl -sSfL --retry 3 --max-time 120 -o "$tmp" "$url"
  actual="$(sha256sum "$tmp" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then
    rm -f "$tmp"
    echo "MISMATCH $file: got $actual, manifest pins $expected" >&2
    exit 1
  fi
  chmod 644 "$tmp"
  mv "$tmp" "$target/$file"
  echo "fetched  $file ($commit)"
done
echo "Ephemeris files in $target match the manifest (aloistr/swisseph@${commit:0:7})."
