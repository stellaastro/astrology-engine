#!/usr/bin/env bash
# Publish the engine source of a build to github.com/stellaastro/astrology-engine,
# as AGPL section 13 requires, BEFORE that build serves the public (ADR-091).
#
#   infrastructure/astrology-engine/publish-source.sh [build-commit]   (default HEAD)
#
# The build commit is the one build-release.sh wrote into build-info.json and the
# engine reports at /version. It is published under the tag source-<first 7>.
# Only services/astrology-engine and infrastructure/astrology-engine leave this
# repository, and commits carry GitHub's no-reply address, not a personal email.
set -euo pipefail
repo="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
commit="$(git -C "$repo" rev-parse "${1:-HEAD}^{commit}")"
short="${commit:0:7}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git clone -q https://github.com/stellaastro/astrology-engine.git "$work/pub"
cd "$work/pub"
if git rev-parse -q --verify "refs/tags/source-$short" >/dev/null; then
  echo "source-$short is already published"
  exit 0
fi
rm -rf services/astrology-engine infrastructure/astrology-engine
git -C "$repo" archive "$commit" services/astrology-engine infrastructure/astrology-engine | tar -x
cp services/astrology-engine/LICENSE LICENSE
email="$(gh api user --jq .id)+stellaastro@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "no source change since the last published build; tagging only"
else
  git -c user.name="Stella Astrology" -c user.email="$email" commit -q -m "Source of build $short" -m "Build commit $commit."
fi
git tag "source-$short"
git push -q origin main "source-$short"
echo "published https://github.com/stellaastro/astrology-engine/tree/source-$short"
