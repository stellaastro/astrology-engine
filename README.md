# Stella astrology engine

This is the source code of the calculation engine behind the Kundli and
Panchang on [stellaastro.com](https://www.stellaastro.com), published under
the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE).

It uses the [Swiss Ephemeris](https://github.com/aloistr/swisseph) through the
[`sweph`](https://github.com/timotejroiko/sweph) binding. Their copyright
notices are kept as published.

| Path | What it is |
|---|---|
| [`services/astrology-engine/`](services/astrology-engine/) | The engine: source, tests, reference fixtures and its own [README](services/astrology-engine/README.md) |
| [`infrastructure/astrology-engine/`](infrastructure/astrology-engine/) | Fetching the pinned ephemeris files, building a release, and the systemd unit it runs under |

## Which version is running

Every build on stellaastro.com reports the commit it was built from at its
`/version` endpoint. That commit is shown on the site beside each
calculation. The source of each build is tagged here as
`source-<first 7 characters of that commit>`. For example,
[`source-33e2bc7`](../../tree/source-33e2bc7) is the source of build
`33e2bc7fee92dbb3e2a5472129682313e478ee82`.

## Build and run

```sh
infrastructure/astrology-engine/fetch-ephe.sh ./ephe    # pinned files, SHA-256 verified
cd services/astrology-engine
npm ci && npm run build
SE_EPHE_PATH=../../ephe ASTROLOGY_AYANAMSA=lahiri ASTROLOGY_NODE=true \
ASTROLOGY_SUNRISE=center_true node dist/main.js         # listens on 127.0.0.1:4003
SE_EPHE_PATH=../../ephe npm test
```
