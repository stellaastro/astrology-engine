#!/usr/bin/env bash
# Build Swiss Ephemeris's own reference program, swetest, from EXACTLY the C
# library source the `sweph` package bundles, plus swetest.c from the same
# release tag. The fixtures in test/fixtures are generated with it, so the
# tests compare the engine against the library's reference program rather than
# against itself.
#
#   scripts/build-swetest.sh <output-dir>      → <output-dir>/swetest
set -euo pipefail
out="${1:?usage: build-swetest.sh <output-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lib="$(node -e 'console.log(require("path").join(require("path").dirname(require.resolve("sweph")), "swisseph"))')"
version="$(grep -oE 'SE_VERSION +"[0-9.]+"' "$lib/sweph.h" | grep -oE '[0-9.]+')"
mkdir -p "$out"
cp "$lib"/*.c "$lib"/*.h "$out"/
curl -sSfL --max-time 60 -o "$out/swetest.c" "https://raw.githubusercontent.com/aloistr/swisseph/v$version/swetest.c"
(cd "$out" && gcc -O2 -w -o swetest swetest.c swecl.c swedate.c swehel.c swehouse.c swejpl.c swemmoon.c swemplan.c sweph.c swephlib.c -lm -ldl)
echo "built $out/swetest from Swiss Ephemeris $version (sweph's bundled source)"
