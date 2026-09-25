# Stella astrology engine

The calculation engine behind the Kundli and Panchang on
[stellaastro.com](https://www.stellaastro.com). It computes sidereal planetary
positions, the Ascendant, whole-sign houses, sunrise and sunset, and the five
limbs of the Panchang with their start and end times, using the
[Swiss Ephemeris](https://github.com/aloistr/swisseph) through the
[`sweph`](https://github.com/timotejroiko/sweph) binding.

It is a small HTTP service that listens on `127.0.0.1` only. It has no
database and no credentials. It is never told who is asking or what the place
is called, and it never logs a request body.

## Licence

**AGPL-3.0-only.** See [LICENSE](LICENSE). The Swiss Ephemeris library and data
files keep their own copyright notices, which this project does not alter.

## What it calculates, and how

| | |
|---|---|
| Zodiac | Sidereal, via `SEFLG_SIDEREAL`. It never subtracts an ayanamsa from tropical positions by hand |
| Ayanamsa | One per process: `lahiri` (`SE_SIDM_LAHIRI`), `true_citra` or `true_pushya` |
| Rahu | True or mean node, one per process. Ketu = Rahu + 180° |
| Houses | Whole sign. The Ascendant is reported **separately** from house 1's start |
| Sunrise | One of three definitions, one per process: `center_true` (`SE_BIT_HINDU_RISING`), `limb_true` (`SE_BIT_NO_REFRACTION`) or `limb_apparent` (refracted upper limb, 1013.25 hPa, 15 °C) |
| Time | Civil UTC → UT1 with `swe_utc_to_jd`, so leap seconds are applied |
| Range | Years 1801–2398. The pinned `sepl_18`/`semo_18`/`seas_18` files cover 1800–2400 |
| Vara | The Hindu day runs from sunrise to sunrise, so a birth before local sunrise takes the previous day's vara |

**Settings are fixed per process, never per request.** Swiss Ephemeris keeps
its sidereal mode in process-global state. A request that names a setting is
refused with 400. Running two configurations means running two processes.

Every response carries the metadata needed to reproduce it:

- the input block it was computed for;
- the engine version and commit;
- the Swiss Ephemeris and `sweph` versions;
- the ephemeris files' source commit and SHA-256;
- the flags the library actually returned;
- the resolved settings, including the exact rise/set flags;
- the Julian days;
- the `calculationStandardVersion`, the version of the engine's own Jyotish
  conventions.

## Running

```sh
infrastructure/astrology-engine/fetch-ephe.sh /path/to/ephe   # pinned files, checksums verified
npm ci && npm run build
SE_EPHE_PATH=/path/to/ephe ASTROLOGY_AYANAMSA=lahiri ASTROLOGY_NODE=true \
ASTROLOGY_SUNRISE=center_true node dist/main.js               # 127.0.0.1:4003
```

The engine **refuses to start** if a setting is missing or unknown, or if an
ephemeris file is absent or differs from `ephemeris-manifest.json`. Swiss
Ephemeris would otherwise fall back to its lower-precision built-in model
without an error. Every position is checked for `SEFLG_SWIEPH` as well.

## API

`POST /v1/chart` and `POST /v1/panchang` both take:

```json
{
  "localDate": "1972-04-05", "localTime": "10:35:00",
  "latitude": 8.7139, "longitude": 77.7567,
  "timezone": "Asia/Kolkata", "resolvedUtcOffset": "+05:30",
  "offsetSource": "iana", "offsetOverridden": false,
  "utcInstant": "1972-04-05T05:05:00Z"
}
```

`utcInstant` must equal `localDate` + `localTime` − `resolvedUtcOffset`. The
engine does not resolve time zones; the caller does, and records how.

The responses:

| Status | Meaning |
|---|---|
| 400 | Malformed request, or a calculation setting was sent |
| 422 | The request is outside what can be calculated: a date out of range, or no sunrise at that place that day |
| 500 | The engine failed. Nothing is ever estimated to fill a gap |

`GET /health` and `GET /version` report the ephemeris status and everything
listed above.

## Verification

`npm test` runs the suites against the real pinned files.

- **Plumbing.** Positions, Ascendant, MC and rise/set times are checked against
  `swetest`, Swiss Ephemeris's reference program, built from the same C source
  (`npm run swetest`, then `npm run fixtures`):
  - 20 instants, 1850–2100, under every ayanamsa and node setting;
  - agreement within 0.001″ and 1 s.
- **Boundaries.** Instants where the Moon, Moon − Sun or Sun + Moon cross a
  sign, nakshatra, pada, tithi, karana or yoga boundary, including across
  360° → 0°:
  - each is located by bisecting `swetest`'s output;
  - labels must flip at exactly that instant;
  - the engine's end-time search must find the instant to within 1 s.
- **Pathological cases.** Births one second either side of sunrise, local-date
  rollover through UTC, the ±180° longitudes, UTC+14 and UTC−11, and polar day
  and night.
- **Convention guard.** A golden snapshot per `calculationStandardVersion`
  fails if results change without that version being bumped.
