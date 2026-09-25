#!/usr/bin/env node
// Generate the engine's reference fixtures from swetest, Swiss Ephemeris's own
// reference program (see build-swetest.sh). Nothing here imports the engine.
//
//   node scripts/generate-fixtures.mjs <swetest> <ephe-dir>  → test/fixtures/swetest.json
//
// Three kinds of fixture:
//   positions  sidereal planets, nodes, Ascendant, MC for 20 instants 1850–2100,
//              under each supported ayanamsa, from the same civil UTC input the
//              engine takes (swetest -utc goes through the same utc_to_jd);
//   rises      sunrise and sunset under each of the three sunrise definitions;
//   boundaries instants where an angle crosses a division boundary, found by
//              bisecting swetest's own output to ~0.1 ms, with swetest's values
//              one second either side.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const [swetest, ephe] = process.argv.slice(2);
if (!swetest || !ephe) {
  console.error('usage: generate-fixtures.mjs <swetest> <ephe-dir>');
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'ephemeris-manifest.json'), 'utf8'));

const run = (args) => execFileSync(swetest, [`-edir${ephe}`, ...args, '-head', '-g,'], { encoding: 'utf8' });
const numbers = (line) => line.split(',').slice(1).map((v) => Number(v.trim()));
const mod360 = (x) => ((x % 360) + 360) % 360;
const signed180 = (x) => { const r = mod360(x); return r >= 180 ? r - 360 : r; };

/** Gregorian date + UT hours → Julian day (Meeus, Astronomical Algorithms ch. 7). Independent of Swiss Ephemeris. */
function julianDay(year, month, day, hours) {
  let y = year; let m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5 + hours / 24;
}

const PLACES = {
  delhi: [28.6139, 77.209], mumbai: [19.076, 72.8777], chennai: [13.0827, 80.2707], kolkata: [22.5726, 88.3639],
  tirunelveli: [8.7139, 77.7567], itarsi: [22.6148, 77.7623], london: [51.5074, -0.1278], newyork: [40.7128, -74.006],
  sydney: [-33.8688, 151.2093], reykjavik: [64.1466, -21.9426], kiritimati: [1.8721, -157.4278], pagopago: [-14.2756, -170.702],
  honolulu: [21.3069, -157.8583], tromso: [69.6492, 18.9553], dateline_east: [-16.5, 179.9], dateline_west: [-16.5, -179.9],
};

// [UTC instant, place]. Chosen to spread across the files' range, both
// hemispheres, both sides of the date line, and a leap-second edge.
const INSTANTS = [
  ['1850-06-15T06:00:00', 'kolkata'], ['1875-03-10T18:30:00', 'mumbai'], ['1900-01-01T00:00:00', 'delhi'],
  ['1920-11-11T11:11:11', 'london'], ['1942-10-02T04:00:00', 'chennai'], ['1947-08-14T18:30:00', 'delhi'],
  ['1955-05-05T23:59:59', 'newyork'], ['1969-07-20T20:17:40', 'itarsi'], ['1972-04-05T05:05:00', 'tirunelveli'],
  ['1984-02-29T12:00:00', 'sydney'], ['1999-12-31T23:59:59', 'reykjavik'], ['2000-01-01T12:00:00', 'kolkata'],
  ['2008-08-08T08:08:08', 'kiritimati'], ['2016-12-31T23:59:59', 'pagopago'], ['2023-10-30T12:00:00', 'honolulu'],
  ['2026-09-25T06:30:00', 'chennai'], ['2040-04-04T04:04:04', 'dateline_east'], ['2060-07-15T15:00:00', 'dateline_west'],
  ['2080-12-25T00:00:00', 'delhi'], ['2100-12-31T18:29:59', 'kolkata'],
];

const AYANAMSAS = { lahiri: 1, true_citra: 27, true_pushya: 29 };
// swetest body letters, in the order printed.
const BODY_ORDER = [['sun', '0'], ['moon', '1'], ['mars', '4'], ['mercury', '2'], ['jupiter', '5'], ['venus', '3'], ['saturn', '6'], ['trueNode', 't'], ['meanNode', 'm']];

function dateArgs(utc) {
  const [date, time] = utc.split('T');
  const [y, m, d] = date.split('-').map(Number);
  return [`-b${d}.${m}.${y}`, `-utc${time}`];
}

function positionsAt(utc, place) {
  const [lat, lon] = PLACES[place];
  const out = {};
  for (const [name, sid] of Object.entries(AYANAMSAS)) {
    const lines = run([...dateArgs(utc), `-p${BODY_ORDER.map(([, p]) => p).join('')}`, `-sid${sid}`, '-fPls', `-house${lon},${lat},W`])
      .split('\n').filter((l) => l.includes(','));
    const bodies = {};
    BODY_ORDER.forEach(([body], i) => {
      const [longitude, speed] = numbers(lines[i]);
      bodies[body] = { longitude, speed };
    });
    const find = (label) => numbers(lines.find((l) => l.startsWith(label)))[0];
    out[name] = { bodies, ascendant: find('Ascendant'), mc: find('MC'), house1: find('house  1') };
  }
  // True positions (SEFLG_TRUEPOS), True Chitra, mean node: Jagannatha Hora's
  // defaults. The Lagna in that mode is the TROPICAL Ascendant minus the
  // ayanamsa the planets carry (SEFLG_TRUEPOS|SEFLG_NONUT), so record both.
  const trueLines = run([...dateArgs(utc), `-p${BODY_ORDER.map(([, p]) => p).join('')}`, '-sid27', '-true', '-fPls']).split('\n').filter((l) => l.includes(','));
  const trueBodies = {};
  BODY_ORDER.forEach(([body], i) => {
    const [longitude, speed] = numbers(trueLines[i]);
    trueBodies[body] = { longitude, speed };
  });
  const tropical = run([...dateArgs(utc), '-p0', '-fPl', `-house${lon},${lat},W`]).split('\n').filter((l) => l.includes(','));
  const tropicalFind = (label) => numbers(tropical.find((l) => l.startsWith(label)))[0];
  const ayanamsa = numbers(run([...dateArgs(utc), '-pb', '-sid27', '-true', '-nonut', '-fPl']).split('\n').find((l) => l.startsWith('Ayanamsha')))[0];
  out.true_citra_truepos = { bodies: trueBodies, tropicalAscendant: tropicalFind('Ascendant'), tropicalMc: tropicalFind('MC'), appliedAyanamsa: ayanamsa };
  return { utc, place, latitude: lat, longitude: lon, ...out };
}

const RISE_ARGS = { center_true: ['-hindu'], limb_true: ['-norefrac'], limb_apparent: [] };

function parseEvent(text) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})[\s,]+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return julianDay(Number(y), Number(mo), Number(d), Number(h) + Number(mi) / 60 + Number(s) / 3600);
}

function risesAt(date, place, body = 'sun') {
  const [lat, lon] = PLACES[place];
  const [y, m, d] = date.split('-').map(Number);
  // Local mean midnight, so the first event found is the morning rise.
  const startJd = julianDay(y, m, d, 0) - lon / 360;
  const out = { date, place, latitude: lat, longitude: lon, body, startJd };
  for (const [definition, sunArgs] of Object.entries(RISE_ARGS)) {
    // The Moon keeps its latitude under center_true: disc centre, no refraction (ADR-091).
    const extra = body === 'moon' && definition === 'center_true' ? ['-disccenter', '-norefrac'] : sunArgs;
    const line = run([`-bj${startJd}`, '-ut', '-rise', `-p${body === 'sun' ? 0 : 1}`, `-geopos${lon},${lat},0`, '-n1', ...extra])
      .split('\n').find((l) => l.startsWith('rise')) ?? '';
    const [risePart, setPart] = line.split(/\bset\b/);
    out[definition] = { rise: parseEvent(risePart ?? ''), set: parseEvent(setPart ?? '') };
  }
  return out;
}

// --- boundaries -------------------------------------------------------------

function anglesAt(jd) {
  const lines = run([`-bj${jd}`, '-ut', '-p01t', '-sid1', '-fPl']).split('\n').filter((l) => l.includes(','));
  const [sun, moon, rahu] = lines.map((l) => numbers(l)[0]);
  return { sun, moon, rahu, elongation: mod360(moon - sun), yoga: mod360(sun + moon) };
}

/** Bisect swetest's own output to the instant `kind` reaches `target`, moving in `direction`. */
function findCrossing(kind, target, startJd, { step = 0.25, direction = 1, maxDays = 60 } = {}) {
  let tPrev = startJd;
  let uPrev = anglesAt(tPrev)[kind];
  const unwrappedTarget = direction > 0 ? uPrev + (mod360(target - uPrev) || 360) : uPrev - (mod360(uPrev - target) || 360);
  const reached = (u) => (direction > 0 ? u >= unwrappedTarget : u <= unwrappedTarget);
  for (let travelled = 0; travelled < maxDays; travelled += step) {
    const t = tPrev + step;
    const u = uPrev + signed180(anglesAt(t)[kind] - uPrev);
    if (reached(u)) {
      let lo = tPrev; let uLo = uPrev; let hi = t;
      while (hi - lo > 1e-9) {
        const mid = (lo + hi) / 2;
        const uMid = uLo + signed180(anglesAt(mid)[kind] - uLo);
        if (reached(uMid)) hi = mid; else { lo = mid; uLo = uMid; }
      }
      return (lo + hi) / 2;
    }
    tPrev = t; uPrev = u;
  }
  throw new Error(`${kind} did not reach ${target} within ${maxDays} days of ${startJd}`);
}

const SECOND = 1 / 86400;
const START_2026 = julianDay(2026, 9, 20, 0);
const START_1850 = julianDay(1850, 3, 1, 0);
const START_2150 = julianDay(2150, 3, 1, 0);
const NAK = 40 / 3;
const BOUNDARIES = [
  ['moon crosses 0°: Pisces → Aries, Revati 4 → Ashwini 1', 'moon', 0, START_2026],
  ['moon crosses 30°: Aries → Taurus (29°59′59″ edge), Krittika 1 → 2', 'moon', 30, START_2026],
  ['moon crosses 13°20′: Ashwini → Bharani', 'moon', NAK, START_2026],
  ['moon crosses 3°20′: Ashwini pada 1 → 2', 'moon', NAK / 4, START_2026],
  ['elongation crosses 0°: Amavasya → Shukla Pratipada, Naga → Kimstughna', 'elongation', 0, START_2026],
  ['elongation crosses 12°: Pratipada → Dwitiya', 'elongation', 12, START_2026],
  ['elongation crosses 180°: Purnima → Krishna Pratipada', 'elongation', 180, START_2026],
  ['elongation crosses 6°: Kimstughna → Bava', 'elongation', 6, START_2026],
  ['yoga angle crosses 0°: Vaidhriti → Vishkambha', 'yoga', 0, START_2026],
  ['yoga angle crosses 13°20′: Vishkambha → Priti', 'yoga', NAK, START_2026],
  ['moon crosses 0° in 1850', 'moon', 0, START_1850],
  ['elongation crosses 0° in 1850', 'elongation', 0, START_1850],
  ['moon crosses 0° in 2150', 'moon', 0, START_2150],
  ['elongation crosses 0° in 2150', 'elongation', 0, START_2150],
];

const boundaries = BOUNDARIES.map(([label, kind, target, start]) => {
  const jd = findCrossing(kind, target, start);
  return { label, kind, target, jd, before: anglesAt(jd - SECOND)[kind], after: anglesAt(jd + SECOND)[kind] };
});
// The true node moves ~0.05°/day, retrograde on average, and wobbles: sample an
// hour either side rather than a second.
const rahuJd = findCrossing('rahu', 0, julianDay(2023, 9, 1, 0), { step: 1, direction: -1, maxDays: 400 });
boundaries.push({ label: 'true Rahu crosses 0°: Aries → Pisces (late 2023)', kind: 'rahu', target: 0, jd: rahuJd, sampleSeconds: 3600, before: anglesAt(rahuJd - 3600 * SECOND).rahu, after: anglesAt(rahuJd + 3600 * SECOND).rahu });

// build-swetest.sh compiles swetest from sweph's bundled source, so this is its version.
const swephHeader = join(dirname(createRequire(import.meta.url).resolve('sweph')), 'swisseph', 'sweph.h');
const version = /SE_VERSION\s+"([0-9.]+)"/.exec(readFileSync(swephHeader, 'utf8'))?.[1] ?? null;
const fixtures = {
  generatedWith: { program: 'swetest', swissEphemeris: version, ephemerisCommit: manifest.commit, generatedAt: new Date().toISOString() },
  positions: INSTANTS.map(([utc, place]) => positionsAt(utc, place)),
  rises: [
    ...INSTANTS.slice(0, 16).map(([utc, place]) => risesAt(utc.slice(0, 10), place)),
    risesAt('2026-06-21', 'tromso'),
    risesAt('2026-12-21', 'tromso'),
    risesAt('2026-09-25', 'chennai', 'moon'),
    risesAt('2000-01-01', 'delhi', 'moon'),
    risesAt('1984-02-29', 'mumbai', 'moon'),
    risesAt('2026-10-10', 'mumbai', 'moon'),
  ],
  boundaries,
};
writeFileSync(join(root, 'test/fixtures/swetest.json'), `${JSON.stringify(fixtures, null, 1)}\n`);
console.log(`wrote ${fixtures.positions.length} position sets, ${fixtures.rises.length} rise/set sets, ${boundaries.length} boundaries`);
