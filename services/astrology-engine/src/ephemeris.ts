// The ONLY file that imports Swiss Ephemeris. Everything above it works in
// plain numbers; everything here checks what the library says it actually did.
//
// Two ways Swiss Ephemeris can quietly give a worse answer than asked for:
//  1. If a data file is missing it falls back to the Moshier model, fills
//     `error` with a warning and still returns a position. The returned flag
//     then lacks SEFLG_SWIEPH. Every position is checked for that bit.
//  2. Its sidereal mode is process-global. The one configured mode is set at
//     boot and re-asserted at the start of every computation, which runs
//     synchronously end to end, so nothing can interleave with it.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as swe from 'sweph';
import {
  AYANAMSAS, OBSERVER_ELEVATION_M, STANDARD_PRESSURE_HPA, STANDARD_TEMPERATURE_C, SUNRISES,
  type EngineConfig,
} from './config';
import { normalize360 } from './jyotish/angles';

const c = swe.constants;
const POSITION_FLAGS = c.SEFLG_SWIEPH | c.SEFLG_SPEED | c.SEFLG_SIDEREAL;

/** The ephemeris could not do what was asked. A server fault, never the caller's. */
export class EphemerisError extends Error {}
/** The request is outside what this engine can calculate (e.g. the date range). */
export class OutOfRangeError extends Error {}

// The .se1 files cover 1800–2400 CE. A year's margin at each end keeps every
// event search (up to three days either side) inside them.
export const FIRST_YEAR = 1801;
export const LAST_YEAR = 2398;

export type Body = 'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter' | 'venus' | 'saturn' | 'rahu';

export interface Position {
  /** Sidereal ecliptic longitude, degrees [0, 360). */
  longitude: number;
  latitude: number;
  /** Degrees per day in longitude. Negative = retrograde. */
  speed: number;
  flag: number;
}

export interface EphemerisIdentity {
  source: string;
  commit: string;
  files: Record<string, string>;
}

interface Manifest {
  source: string;
  commit: string;
  files: Record<string, string>;
}

const PACKAGE_ROOT = join(__dirname, '..');

/** Refuse to run on files that are not byte-for-byte the pinned ones. */
export function verifyEphemerisFiles(ephePath: string): EphemerisIdentity {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'ephemeris-manifest.json'), 'utf8')) as Manifest;
  for (const [name, expected] of Object.entries(manifest.files)) {
    let actual: string;
    try {
      actual = createHash('sha256').update(readFileSync(join(ephePath, name))).digest('hex');
    } catch (error) {
      throw new EphemerisError(`ephemeris file ${name} is not readable in ${ephePath}: ${(error as Error).message}`);
    }
    if (actual !== expected) throw new EphemerisError(`ephemeris file ${name} has sha256 ${actual}, the manifest pins ${expected}`);
  }
  return { source: manifest.source, commit: manifest.commit, files: { ...manifest.files } };
}

function swephPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(dirname(require.resolve('sweph')), 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

const FLAG_NAMES: [number, string][] = [
  [c.SEFLG_JPLEPH, 'SEFLG_JPLEPH'], [c.SEFLG_SWIEPH, 'SEFLG_SWIEPH'], [c.SEFLG_MOSEPH, 'SEFLG_MOSEPH'],
  [c.SEFLG_NONUT, 'SEFLG_NONUT'], [c.SEFLG_SPEED, 'SEFLG_SPEED'], [c.SEFLG_SIDEREAL, 'SEFLG_SIDEREAL'],
];

export function flagNames(flag: number): string[] {
  return FLAG_NAMES.filter(([bit]) => (flag & bit) !== 0).map(([, name]) => name);
}

export class SwissEphemeris {
  readonly identity: EphemerisIdentity;
  readonly sweVersion: string;
  readonly swephPackage: string;
  readonly probeFlag: number;
  private readonly sidMode: number;
  private readonly nodeBody: number;
  private readonly riseMethod: number;
  private readonly refraction: boolean;

  constructor(private readonly config: EngineConfig) {
    this.identity = verifyEphemerisFiles(config.ephePath);
    swe.set_ephe_path(config.ephePath);
    this.sidMode = AYANAMSAS[config.ayanamsa].sidMode;
    this.nodeBody = config.node === 'true' ? c.SE_TRUE_NODE : c.SE_MEAN_NODE;
    this.riseMethod = SUNRISES[config.sunrise].rsmi;
    this.refraction = SUNRISES[config.sunrise].refraction;
    swe.set_sid_mode(this.sidMode, 0, 0);
    this.sweVersion = swe.version();
    this.swephPackage = swephPackageVersion();
    this.probeFlag = this.probe();
  }

  /** J2000 Sun, through the same path every chart uses. Throws unless it came from the files. */
  probe(): number {
    this.assertMode();
    return this.position(2_451_545, 'sun').flag;
  }

  /** Re-assert the one sidereal mode. First call of every computation. */
  assertMode(): void {
    swe.set_sid_mode(this.sidMode, 0, 0);
  }

  /** Civil UTC → Julian day in UT1 (for positions) and TT. Handles leap seconds. */
  julianDay(year: number, month: number, day: number, hour: number, minute: number, second: number): { ut1: number; tt: number } {
    if (year < FIRST_YEAR || year > LAST_YEAR) throw new OutOfRangeError(`year ${year} is outside ${FIRST_YEAR}–${LAST_YEAR}`);
    const result = swe.utc_to_jd(year, month, day, hour, minute, second, c.SE_GREG_CAL);
    if (result.flag !== c.OK) throw new OutOfRangeError(`not a valid UTC time: ${result.error}`);
    const [tt, ut1] = result.data;
    return { ut1, tt };
  }

  position(jdUt: number, body: Body): Position {
    const ipl = body === 'rahu' ? this.nodeBody : BODY_NUMBERS[body];
    const result = swe.calc_ut(jdUt, ipl, POSITION_FLAGS);
    if (result.flag < 0) throw new EphemerisError(`calc_ut(${body}) failed: ${result.error}`);
    if ((result.flag & c.SEFLG_SWIEPH) === 0) {
      throw new EphemerisError(`calc_ut(${body}) did not use the Swiss Ephemeris files (flags ${flagNames(result.flag).join('|')}): ${result.error}`);
    }
    if ((result.flag & c.SEFLG_SIDEREAL) === 0) throw new EphemerisError(`calc_ut(${body}) did not return a sidereal position`);
    const [longitude, latitude, , speed] = result.data;
    return { longitude: normalize360(longitude), latitude, speed, flag: result.flag };
  }

  /** Sidereal Ascendant, MC and whole-sign cusps. The Ascendant is NOT house 1's start. */
  angles(jdUt: number, latitude: number, longitude: number): { ascendant: number; mc: number; house1Start: number } {
    const result = swe.houses_ex2(jdUt, c.SEFLG_SIDEREAL, latitude, longitude, 'W');
    if (result.flag !== c.OK) throw new EphemerisError(`houses_ex2 failed: ${result.error}`);
    const [ascendant, mc] = result.data.points;
    return { ascendant: normalize360(ascendant), mc: normalize360(mc), house1Start: normalize360(result.data.houses[0]) };
  }

  /** The configured ayanamsa, with nutation (true) and without (mean). Positions are consistent with both. */
  ayanamsa(jdUt: number): { trueDeg: number; meanDeg: number } {
    const withNutation = swe.get_ayanamsa_ex_ut(jdUt, c.SEFLG_SWIEPH);
    const withoutNutation = swe.get_ayanamsa_ex_ut(jdUt, c.SEFLG_SWIEPH | c.SEFLG_NONUT);
    for (const result of [withNutation, withoutNutation]) {
      if (result.flag < 0 || (result.flag & c.SEFLG_SWIEPH) === 0) throw new EphemerisError(`get_ayanamsa_ex_ut failed: ${result.error}`);
    }
    return { trueDeg: withNutation.data, meanDeg: withoutNutation.data };
  }

  /**
   * The first rise or set of the Sun or Moon after `jdStart`, by the configured
   * definition. `null` when there is none to find (polar day or night), which
   * the caller reports as such — never estimated.
   */
  riseSet(jdStart: number, body: 'sun' | 'moon', event: 'rise' | 'set', latitude: number, longitude: number): number | null {
    const which = event === 'rise' ? c.SE_CALC_RISE : c.SE_CALC_SET;
    const result = swe.rise_trans(
      jdStart, body === 'sun' ? c.SE_SUN : c.SE_MOON, null, c.SEFLG_SWIEPH, which | this.riseMethod,
      [longitude, latitude, OBSERVER_ELEVATION_M],
      this.refraction ? STANDARD_PRESSURE_HPA : 0, this.refraction ? STANDARD_TEMPERATURE_C : 0,
    );
    if (result.flag === -2) return null;
    if (result.flag !== c.OK) throw new EphemerisError(`rise_trans(${body} ${event}) failed: ${result.error}`);
    return result.data;
  }

  /** Julian day (UT1) → civil UTC, to the nearest second, as `YYYY-MM-DDTHH:MM:SSZ`. */
  utcIso(jdUt: number): string {
    // UT1 → UTC shifts by a fractional second (and by leap seconds), so round
    // the civil result, carrying into the minute, not the Julian day.
    const d = swe.jdut1_to_utc(jdUt, c.SE_GREG_CAL);
    const ms = Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, 0) + d.second * 1000;
    return new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  }
}

const BODY_NUMBERS: Record<Exclude<Body, 'rahu'>, number> = {
  sun: c.SE_SUN, moon: c.SE_MOON, mars: c.SE_MARS, mercury: c.SE_MERCURY,
  jupiter: c.SE_JUPITER, venus: c.SE_VENUS, saturn: c.SE_SATURN,
};
