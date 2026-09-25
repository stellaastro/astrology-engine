import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeChart } from '../src/chart';
import { ConfigError, loadConfig } from '../src/config';
import { Engine } from '../src/engine';
import { EphemerisError, OutOfRangeError } from '../src/ephemeris';
import { InputError, parseInput } from '../src/input';
import { computePanchang, NoSunriseError } from '../src/panchang-day';
import { CALCULATION_STANDARD_VERSION } from '../src/standard';
import { EPHE_PATH, inputAt, makeConfig, makeEngine, SECOND_IN_DAYS } from './helpers';

const VALID = {
  localDate: '1972-04-05', localTime: '10:35:00', latitude: 8.7139, longitude: 77.7567, timezone: 'Asia/Kolkata',
  resolvedUtcOffset: '+05:30', offsetSource: 'iana', offsetOverridden: false, utcInstant: '1972-04-05T05:05:00Z',
};

describe('boot', () => {
  it('refuses to start without the ephemeris files — never falls back to Moshier', () => {
    const empty = mkdtempSync(join(tmpdir(), 'ephe-'));
    expect(() => new Engine(makeConfig({ ephePath: empty }), { version: 't', commit: null })).toThrow(EphemerisError);
  });

  it('refuses a file whose bytes are not the pinned ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ephe-'));
    for (const f of ['sepl_18.se1', 'semo_18.se1', 'seas_18.se1']) copyFileSync(join(EPHE_PATH, f), join(dir, f));
    const tampered = readFileSync(join(dir, 'semo_18.se1'));
    tampered[tampered.length - 1] ^= 0xff;
    writeFileSync(join(dir, 'semo_18.se1'), tampered);
    expect(() => new Engine(makeConfig({ ephePath: dir }), { version: 't', commit: null })).toThrow(/semo_18\.se1 has sha256/);
  });

  it('requires every calculation setting, and refuses an unknown one', () => {
    const env = { SE_EPHE_PATH: EPHE_PATH, ASTROLOGY_AYANAMSA: 'lahiri', ASTROLOGY_NODE: 'true', ASTROLOGY_SUNRISE: 'center_true' };
    expect(loadConfig(env)).toMatchObject({ ayanamsa: 'lahiri', node: 'true', sunrise: 'center_true', port: 4003, sourceUrl: null });
    for (const key of Object.keys(env)) expect(() => loadConfig({ ...env, [key]: '' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, ASTROLOGY_AYANAMSA: 'raman' })).toThrow(/not one of/);
    expect(() => loadConfig({ ...env, ASTROLOGY_SUNRISE: 'hindu' })).toThrow(/not one of/);
    expect(() => loadConfig({ ...env, ASTROLOGY_ENGINE_PORT: '80' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, ASTROLOGY_ENGINE_SOURCE_URL: 'http://insecure' })).toThrow(ConfigError);
  });
});

describe('input', () => {
  it('refuses calculation settings: they are fixed by the server', () => {
    for (const key of ['ayanamsa', 'node', 'houseSystem', 'sunrise']) {
      expect(() => parseInput({ ...VALID, [key]: 'x' })).toThrow(/cannot be chosen per request/);
    }
  });
  it('refuses unexpected and missing fields', () => {
    expect(() => parseInput({ ...VALID, name: 'A. Person' })).toThrow(/unexpected field "name"/);
    const { latitude: _, ...missing } = VALID;
    expect(() => parseInput(missing)).toThrow(/"latitude" is required/);
  });
  it('refuses a UTC instant that does not follow from the local time and offset', () => {
    expect(() => parseInput({ ...VALID, utcInstant: '1972-04-05T05:05:01Z' })).toThrow(InputError);
    expect(() => parseInput({ ...VALID, resolvedUtcOffset: '+06:30' })).toThrow(/does not equal/);
  });
  it('keeps the seconds of a local-mean-time offset', () => {
    const lmt = parseInput({ ...VALID, localDate: '1850-01-01', localTime: '06:00:00', timezone: null, resolvedUtcOffset: '+05:53:28', offsetSource: 'user_override', offsetOverridden: true, utcInstant: '1850-01-01T00:06:32Z' });
    expect(lmt.offsetSeconds).toBe(5 * 3600 + 53 * 60 + 28);
  });
  it('requires overridden to match the source, and a zone for an IANA offset', () => {
    expect(() => parseInput({ ...VALID, offsetOverridden: true })).toThrow(/exactly when/);
    expect(() => parseInput({ ...VALID, timezone: null })).toThrow(/must name its "timezone"/);
  });
  it('refuses dates outside the files, as out of range rather than malformed', () => {
    expect(() => parseInput({ ...VALID, localDate: '1800-06-01', utcInstant: '1800-05-31T23:30:00Z', localTime: '05:00:00' })).toThrow(OutOfRangeError);
    expect(() => parseInput({ ...VALID, localDate: '2399-06-01', utcInstant: '2399-05-31T23:30:00Z', localTime: '05:00:00' })).toThrow(OutOfRangeError);
    expect(() => parseInput({ ...VALID, localDate: '1972-02-30' })).toThrow(/not a calendar date/);
  });
});

describe('chart', () => {
  const engine = makeEngine();

  it('keeps the Ascendant separate from the start of whole-sign house 1', () => {
    const chart = computeChart(engine, parseInput(VALID));
    expect(chart.ascendant.sign).toBe('Taurus');
    expect(chart.ascendant.longitude).toBeCloseTo(58.6034, 4);
    expect(chart.ascendant.degreeInSign).toBeCloseTo(28.6034, 4);
    expect(chart.houses).toEqual({ system: 'whole_sign', house1StartLongitude: 30 });
    // Venus (37.8°) and Saturn (39.7°) are BEFORE the Ascendant degree and still in house 1.
    for (const id of ['venus', 'saturn', 'mars']) expect(chart.planets.find((p) => p.id === id)!.house).toBe(1);
  });

  it('gives every position from the Swiss Ephemeris files, sidereal, with speed', () => {
    const chart = computeChart(engine, parseInput(VALID));
    expect(chart.meta.ephemeris.flagsReturned).toEqual(expect.arrayContaining(['SEFLG_SWIEPH', 'SEFLG_SIDEREAL', 'SEFLG_SPEED']));
    expect(chart.meta.ephemeris.flagsReturned).not.toContain('SEFLG_MOSEPH');
  });

  it('records the exact sunrise method, not a label', () => {
    const meta = (sunrise: 'center_true' | 'limb_true' | 'limb_apparent') => computeChart(makeEngine({ sunrise }), parseInput(VALID)).meta.config.sunrise;
    expect(meta('center_true')).toEqual({
      definition: 'center_true', method: 'SE_BIT_HINDU_RISING',
      implies: ['SE_BIT_DISC_CENTER', 'SE_BIT_NO_REFRACTION', 'SE_BIT_GEOCTR_NO_ECL_LAT'], rsmi: 896,
      observerElevationM: 0, pressureHpa: null, temperatureC: null,
    });
    expect(meta('limb_true')).toMatchObject({ method: 'SE_BIT_NO_REFRACTION', rsmi: 512, pressureHpa: null });
    expect(meta('limb_apparent')).toMatchObject({ rsmi: 0, pressureHpa: 1013.25, temperatureC: 15 });
  });

  it('reports both ayanamsa values and the version of its own conventions', () => {
    const { meta } = computeChart(engine, parseInput(VALID));
    expect(meta.calculationStandardVersion).toBe(CALCULATION_STANDARD_VERSION);
    expect(meta.config.ayanamsa).toMatchObject({ name: 'lahiri', sidMode: 'SE_SIDM_LAHIRI', sidModeNumber: 1 });
    expect(meta.config.ayanamsa.valueTrueDeg - meta.config.ayanamsa.valueMeanDeg).toBeCloseTo(13.88 / 3600, 5);
  });
});

describe('vara and the Hindu day', () => {
  const engine = makeEngine();
  const CHENNAI = [13.0827, 80.2707] as const;
  // Hindu (centre-of-disc) sunrise in Chennai on 2026-09-25, from swetest: 00:31:29.2 UTC.
  const SUNRISE_MS = Date.UTC(2026, 8, 25, 0, 31, 29, 200);

  it('a birth one second before sunrise takes the previous day\'s vara; one second after, this day\'s', () => {
    const before = computeChart(engine, inputAt(new Date(Math.floor(SUNRISE_MS / 1000) * 1000 - 1000).toISOString(), ...CHENNAI));
    const after = computeChart(engine, inputAt(new Date(Math.ceil(SUNRISE_MS / 1000) * 1000 + 1000).toISOString(), ...CHENNAI));
    expect(before.panchang.vara).toMatchObject({ english: 'Thursday', beforeSunrise: true });
    expect(after.panchang.vara).toMatchObject({ english: 'Friday', beforeSunrise: false });
    expect(Math.abs(after.panchang.sunrise!.jdUt - before.panchang.sunrise!.jdUt)).toBeLessThan(SECOND_IN_DAYS);
  });

  it('uses the LOCAL date when UTC has rolled back a day (02:00 IST)', () => {
    const chart = computeChart(engine, inputAt('2026-09-24T20:30:00Z', ...CHENNAI));
    expect(chart.input).toMatchObject({ localDate: '2026-09-25', localTime: '02:00:00', utcInstant: '2026-09-24T20:30:00Z' });
    expect(chart.panchang.vara).toMatchObject({ english: 'Thursday', beforeSunrise: true });
  });

  it('uses the LOCAL date when UTC has rolled forward a day (20:00 at −07:00)', () => {
    const chart = computeChart(engine, inputAt('2026-09-26T03:00:00Z', 34.0522, -118.2437, -7 * 3600, 'America/Los_Angeles'));
    expect(chart.input).toMatchObject({ localDate: '2026-09-25', localTime: '20:00:00' });
    expect(chart.panchang.vara).toMatchObject({ english: 'Friday', beforeSunrise: false });
  });
});

describe('panchang at the edges of the map', () => {
  const engine = makeEngine();
  const cases: [string, string, number, number, number, string][] = [
    ['UTC+14 (Kiritimati)', '2026-09-24T22:00:00Z', 1.8721, -157.4278, 14 * 3600, 'Pacific/Kiritimati'],
    ['UTC−11 (Pago Pago)', '2026-09-25T23:00:00Z', -14.2756, -170.702, -11 * 3600, 'Pacific/Pago_Pago'],
    ['longitude +179.9', '2026-09-25T00:00:00Z', -16.5, 179.9, 12 * 3600, 'Pacific/Fiji'],
    ['longitude −179.9', '2026-09-25T23:00:00Z', -16.5, -179.9, -11 * 3600, 'Pacific/Niue'],
  ];
  it.each(cases)('%s: sunrise falls on the local date and the day is divided without gaps', (_label, utc, lat, lon, offset, zone) => {
    const input = inputAt(utc, lat, lon, offset, zone);
    const p = computePanchang(engine, input);
    const localMidnightMs = Date.parse(`${input.localDate}T00:00:00Z`) - offset * 1000;
    const sunriseMs = Date.parse(p.day.sunrise.utc);
    expect(sunriseMs).toBeGreaterThan(localMidnightMs);
    expect(sunriseMs).toBeLessThan(localMidnightMs + 86_400_000);
    for (const list of [p.tithis, p.nakshatras, p.yogas, p.karanas]) {
      expect(list[0]!.start.jdUt).toBeLessThanOrEqual(p.day.sunrise.jdUt);
      expect(list.at(-1)!.end.jdUt).toBeGreaterThanOrEqual(p.day.nextSunrise.jdUt);
      for (let i = 1; i < list.length; i++) expect(list[i]!.start.jdUt).toBe(list[i - 1]!.end.jdUt);
    }
  });

  it('refuses a Panchang where the Sun does not rise, and a chart says so instead of guessing', () => {
    const tromso = inputAt('2026-06-21T10:00:00Z', 69.6492, 18.9553, 2 * 3600, 'Europe/Oslo');
    expect(() => computePanchang(engine, tromso)).toThrow(NoSunriseError);
    const chart = computeChart(engine, tromso);
    expect(chart.panchang).toMatchObject({ vara: null, sunrise: null, sunriseStatus: 'not_found' });
    expect(chart.planets).toHaveLength(9);
  });
});

describe('global Swiss Ephemeris state', () => {
  it('re-asserts the sidereal mode per computation, so two configurations never bleed into each other', () => {
    const lahiri = makeEngine({ ayanamsa: 'lahiri' });
    const pushya = makeEngine({ ayanamsa: 'true_pushya' });
    const input = parseInput(VALID);
    const a1 = computeChart(lahiri, input).planets[1]!.longitude;
    const b1 = computeChart(pushya, input).planets[1]!.longitude;
    const a2 = computeChart(lahiri, input).planets[1]!.longitude;
    expect(a1).toBe(a2);
    expect(Math.abs(a1 - b1)).toBeGreaterThan(0.01);
  });
});

describe(`golden output for ${CALCULATION_STANDARD_VERSION}`, () => {
  // Outputs that change without a CALCULATION_STANDARD_VERSION bump fail here.
  // Never regenerate an existing version's file: bump the version instead.
  it('matches the snapshot recorded for this calculation standard', async () => {
    const engine = makeEngine();
    const strip = <T extends { meta: Record<string, unknown> }>(r: T) => ({ ...r, meta: { ...r.meta, calculatedAt: undefined, engine: undefined } });
    const out = {
      chart: strip(computeChart(engine, parseInput(VALID))),
      panchang: strip(computePanchang(engine, inputAt('2026-09-25T06:30:00Z', 13.0827, 80.2707))),
      before1900: strip(computeChart(engine, inputAt('1850-06-15T06:00:00Z', 22.5726, 88.3639))),
    };
    await expect(`${JSON.stringify(out, null, 1)}\n`).toMatchFileSnapshot(`./__snapshots__/${CALCULATION_STANDARD_VERSION}.json`);
  });
});
