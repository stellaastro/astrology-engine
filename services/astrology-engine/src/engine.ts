import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AYANAMSAS, OBSERVER_ELEVATION_M, STANDARD_PRESSURE_HPA, STANDARD_TEMPERATURE_C, SUNRISES, type EngineConfig } from './config';
import { flagNames, SwissEphemeris } from './ephemeris';
import { CALCULATION_STANDARD_VERSION } from './standard';

const PACKAGE_ROOT = join(__dirname, '..');

export interface BuildInfo {
  version: string;
  /** Git commit this build was made from; written by the release build. Null in development. */
  commit: string | null;
}

export function readBuildInfo(): BuildInfo {
  const { version } = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string };
  let commit: string | null = null;
  try {
    const info = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'build-info.json'), 'utf8')) as { commit?: unknown };
    if (typeof info.commit === 'string' && /^[0-9a-f]{40}$/.test(info.commit)) commit = info.commit;
  } catch {
    // No build-info.json: a development checkout, not a release.
  }
  return { version, commit };
}

/** Everything a response needs to be reproduced, less the per-request numbers. */
export class Engine {
  readonly eph: SwissEphemeris;
  readonly build: BuildInfo;

  constructor(readonly config: EngineConfig, build: BuildInfo = readBuildInfo()) {
    this.eph = new SwissEphemeris(config);
    this.build = build;
  }

  /** The metadata block of a response, given the Julian day it was computed for. */
  meta(jd: { ut1: number; tt: number }, flag: number) {
    const ayanamsa = this.eph.ayanamsa(jd.ut1);
    const sunrise = SUNRISES[this.config.sunrise];
    return {
      calculationStandardVersion: CALCULATION_STANDARD_VERSION,
      engine: this.describeEngine(),
      swissEphemeris: { version: this.eph.sweVersion, swephPackage: this.eph.swephPackage },
      ephemeris: { ...this.eph.identity, flagsReturned: flagNames(flag) },
      config: {
        zodiac: 'sidereal' as const,
        ayanamsa: {
          name: this.config.ayanamsa,
          sidMode: AYANAMSAS[this.config.ayanamsa].constant,
          sidModeNumber: AYANAMSAS[this.config.ayanamsa].sidMode,
          valueTrueDeg: ayanamsa.trueDeg,
          valueMeanDeg: ayanamsa.meanDeg,
        },
        node: this.config.node,
        nodeBody: this.config.node === 'true' ? 'SE_TRUE_NODE' : 'SE_MEAN_NODE',
        houseSystem: 'whole_sign' as const,
        houseSystemCode: 'W' as const,
        sunrise: {
          definition: this.config.sunrise,
          method: sunrise.method,
          implies: [...sunrise.implies],
          rsmi: sunrise.rsmi,
          observerElevationM: OBSERVER_ELEVATION_M,
          pressureHpa: sunrise.refraction ? STANDARD_PRESSURE_HPA : null,
          temperatureC: sunrise.refraction ? STANDARD_TEMPERATURE_C : null,
        },
      },
      julianDayUt: jd.ut1,
      julianDayTt: jd.tt,
    };
  }

  describeEngine() {
    return {
      name: '@stella/astrology-engine',
      version: this.build.version,
      commit: this.build.commit,
      licence: 'AGPL-3.0-only',
      source: this.config.sourceUrl,
    };
  }

  /** Split an epoch-milliseconds UTC instant and convert it to Julian days. */
  julianDayAt(utcMs: number): { ut1: number; tt: number } {
    const d = new Date(utcMs);
    return this.eph.julianDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  /** A moment in both forms: the Julian day it was computed at and civil UTC. */
  moment(jdUt: number) {
    return { jdUt, utc: this.eph.utcIso(jdUt) };
  }
}
