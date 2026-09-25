import { EphemerisError, type Body, type Position } from './ephemeris';
import type { Engine } from './engine';
import { echo, type ParsedInput } from './input';
import { normalize360 } from './jyotish/angles';
import { nakshatraOf } from './jyotish/nakshatra';
import { elongation, karanaOf, tithiOf, varaOf, weekdayOf, yogaAngle, yogaOf } from './jyotish/panchang';
import { rashiOf, wholeSignHouse, type Graha } from './jyotish/rashi';
import { DIVISIONS, VARGA_NAMES, navamsaSignNumber, vargaSignNumber } from './jyotish/varga';
import { avakhadaOf } from './jyotish/avakhada';
import { kaalSarpOf, manglikOf } from './jyotish/dosha';
import { sadeSatiOf, SADE_SATI_YEARS } from './sade-sati';
import { solarYearClock, vimshottari, type DashaPeriod } from './jyotish/dasha';

const GRAHAS: Graha[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

/**
 * Sunrise on the input's LOCAL civil date. The Hindu day runs sunrise to
 * sunrise, so this decides the vara. `null` when the Sun does not rise there
 * that day — reported, never estimated.
 */
export function sunriseOnLocalDate(engine: Engine, input: ParsedInput): { midnightJd: number; sunriseJd: number | null } {
  const { year, month, day } = input.local;
  const midnightJd = engine.julianDayAt(Date.UTC(year, month - 1, day) - input.offsetSeconds * 1000).ut1;
  const rise = engine.eph.riseSet(midnightJd, 'sun', 'rise', input.latitude, input.longitude);
  return { midnightJd, sunriseJd: rise !== null && rise < midnightJd + 1 ? rise : null };
}

/** The vara in force at `jd`: before the local date's sunrise it is still the previous day's. */
export function varaAt(input: ParsedInput, jd: number, sunriseJd: number | null) {
  if (sunriseJd === null) return null;
  const beforeSunrise = jd < sunriseJd;
  const { year, month, day } = input.local;
  return { ...varaOf(weekdayOf(year, month, day) - (beforeSunrise ? 1 : 0)), beforeSunrise };
}

export function computeChart(engine: Engine, input: ParsedInput) {
  engine.eph.assertMode();
  const jd = engine.julianDayAt(input.utcMs);

  const positions = new Map<Graha, Position>();
  for (const body of GRAHAS.filter((g): g is Body => g !== 'ketu')) positions.set(body, engine.eph.position(jd.ut1, body));
  const rahu = positions.get('rahu')!;
  // Ketu is the descending node: exactly opposite Rahu, moving with it.
  positions.set('ketu', { longitude: normalize360(rahu.longitude + 180), latitude: -rahu.latitude, speed: rahu.speed, flag: rahu.flag });

  const angles = engine.eph.angles(jd.ut1, input.latitude, input.longitude);
  const lagna = rashiOf(angles.ascendant);
  // Whole sign: house 1 is the WHOLE sign the Ascendant is in, starting at 0°
  // of it. If Swiss Ephemeris ever disagreed, every house number would be wrong.
  if (Math.abs(angles.house1Start - (lagna.signNumber - 1) * 30) > 1e-9) {
    throw new EphemerisError(`whole-sign house 1 starts at ${angles.house1Start}°, not at the start of the Ascendant's sign`);
  }

  const sun = positions.get('sun')!.longitude;
  const moon = positions.get('moon')!.longitude;
  const elong = elongation(sun, moon);
  const { sunriseJd } = sunriseOnLocalDate(engine, input);

  const signOf = (n: number) => { const { signNumber, sign, rashi, signLord } = rashiOf((n - 1) * 30 + 15); return { signNumber, sign, rashi, signLord }; };
  const dasha = vimshottari(moon, 3, solarYearClock((t) => engine.eph.position(t, 'sun'), jd.ut1));
  const period = (p: DashaPeriod): Record<string, unknown> => ({
    // Plain UTC strings: 819 periods with Julian days attached would double the response.
    lord: p.lord, level: p.level, start: engine.eph.utcIso(p.startJd), end: engine.eph.utcIso(p.endJd),
    ...(p.periods ? { periods: p.periods.map(period) } : {}),
  });

  return {
    input: echo(input),
    ascendant: { longitude: angles.ascendant, ...lagna, nakshatra: nakshatraOf(angles.ascendant) },
    houses: { system: 'whole_sign' as const, house1StartLongitude: angles.house1Start },
    midheaven: { longitude: angles.mc, ...rashiOf(angles.mc) },
    planets: GRAHAS.map((id) => {
      const p = positions.get(id)!;
      return {
        id,
        longitude: p.longitude,
        latitude: p.latitude,
        speed: p.speed,
        retrograde: p.speed < 0,
        ...rashiOf(p.longitude),
        nakshatra: nakshatraOf(p.longitude),
        house: wholeSignHouse(p.longitude, angles.ascendant),
      };
    }),
    navamsa: {
      ascendant: signOf(navamsaSignNumber(angles.ascendant)),
      planets: GRAHAS.map((id) => ({ id, ...signOf(navamsaSignNumber(positions.get(id)!.longitude)) })),
    },
    // The sixteen Parashari divisional charts, as sign numbers (1 = Aries).
    vargas: DIVISIONS.map((division) => ({
      division,
      name: VARGA_NAMES[division],
      ascendant: vargaSignNumber(division, angles.ascendant),
      planets: Object.fromEntries(GRAHAS.map((id) => [id, vargaSignNumber(division, positions.get(id)!.longitude)])),
    })),
    // Standard birth details, all read from the Moon (ADR-091, Stage 2b).
    avakhada: avakhadaOf(moon),
    // Dosha checks as placements, with no cancellations applied (Stage 2d).
    doshas: doshasOf(engine, positions, angles.ascendant, jd.ut1),
    dasha: {
      system: 'vimshottari' as const,
      startedFrom: 'moon' as const,
      firstLord: dasha.firstLord,
      balanceYears: dasha.balanceYears,
      periods: dasha.periods.map(period),
    },
    panchang: {
      tithi: tithiOf(elong),
      karana: karanaOf(elong),
      yoga: yogaOf(yogaAngle(sun, moon)),
      vara: varaAt(input, jd.ut1, sunriseJd),
      sunrise: sunriseJd === null ? null : engine.moment(sunriseJd),
      sunriseStatus: sunriseJd === null ? ('not_found' as const) : ('found' as const),
    },
    meta: { ...engine.meta(jd, positions.get('moon')!.flag), calculatedAt: new Date().toISOString() },
  };
}

function doshasOf(engine: Engine, positions: Map<Graha, Position>, ascendant: number, birthJd: number) {
  const longitude = (id: Graha) => positions.get(id)!.longitude;
  const moonSign = rashiOf(longitude('moon')).signNumber - 1;
  const iso = (jd: number | null) => (jd === null ? null : engine.eph.utcIso(jd));
  const signName = (index: number) => rashiOf(index * 30 + 15).sign;
  const sade = sadeSatiOf(engine, moonSign, birthJd, SADE_SATI_YEARS);
  return {
    manglik: manglikOf(longitude('mars'), { lagna: ascendant, moon: longitude('moon'), venus: longitude('venus') }),
    kaalSarp: kaalSarpOf(Object.fromEntries(GRAHAS.map((id) => [id, longitude(id)])) as Record<Graha, number>, ascendant),
    sadeSati: {
      moonSign: moonSign + 1,
      years: SADE_SATI_YEARS,
      until: iso(sade.endJd),
      cycles: sade.cycles.map((c) => ({
        start: iso(c.start), end: iso(c.end),
        phases: c.phases.map((p) => ({ phase: p.phase, signNumber: p.sign + 1, sign: signName(p.sign), start: iso(p.start), end: iso(p.end) })),
      })),
      dhaiya: sade.dhaiya.map((d) => ({ kind: d.kind, signNumber: d.sign + 1, sign: signName(d.sign), start: iso(d.start), end: iso(d.end) })),
    },
  };
}
