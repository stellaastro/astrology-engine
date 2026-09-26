import { sunriseOnLocalDate, varaAt } from './chart';
import type { Engine } from './engine';
import { echo, type ParsedInput } from './input';
import { MAS_PER_DEGREE } from './jyotish/angles';
import { periodsBetween, type AngleAt, type Period } from './jyotish/crossings';
import { dayPeriods } from './jyotish/day-periods';
import { MAS_PER_NAKSHATRA, nakshatraOf } from './jyotish/nakshatra';
import { elongation, karanaOf, KARANA_DEGREES, TITHI_DEGREES, tithiOf, varaOf, weekdayOf, yogaAngle, yogaOf } from './jyotish/panchang';

/** The Sun never rises (or never sets and rises again) there that day. The caller's place, not a fault; 422. */
export class NoSunriseError extends Error {}

const MAS_PER_TITHI = TITHI_DEGREES * MAS_PER_DEGREE;
const MAS_PER_KARANA = KARANA_DEGREES * MAS_PER_DEGREE;

/**
 * The Panchang for the input's local date: the Hindu day from that date's
 * sunrise to the next, every tithi, nakshatra, yoga and karana in force during
 * it with its start and end, and the five limbs at the input's reference time.
 */
export function computePanchang(engine: Engine, input: ParsedInput) {
  engine.eph.assertMode();
  const { eph } = engine;
  const jd = engine.julianDayAt(input.utcMs);
  const { latitude, longitude } = input;

  const { midnightJd, sunriseJd } = sunriseOnLocalDate(engine, input);
  if (sunriseJd === null) throw new NoSunriseError(`the Sun does not rise at ${latitude}, ${longitude} on ${input.localDate}, so there is no Hindu day to divide`);
  // A minute past sunrise, so the search cannot return this same sunrise.
  const nextSunriseJd = eph.riseSet(sunriseJd + 60 / 86_400, 'sun', 'rise', latitude, longitude);
  if (nextSunriseJd === null) throw new NoSunriseError(`the Sun does not rise again at ${latitude}, ${longitude} after ${input.localDate}`);
  const sunsetJd = eph.riseSet(sunriseJd, 'sun', 'set', latitude, longitude);
  const onThisDate = (value: number | null) => (value !== null && value < midnightJd + 1 ? value : null);
  const moonriseJd = onThisDate(eph.riseSet(midnightJd, 'moon', 'rise', latitude, longitude));
  const moonsetJd = onThisDate(eph.riseSet(midnightJd, 'moon', 'set', latitude, longitude));
  // The sunset before this sunrise (searched from a day earlier): the night
  // whose last muhurtas hold Brahma Muhurta.
  const previousSunsetJd = eph.riseSet(sunriseJd - 1, 'sun', 'set', latitude, longitude);
  const { year, month, day } = input.local;
  const weekday = weekdayOf(year, month, day);

  const sunMoon = (t: number) => [eph.position(t, 'sun').longitude, eph.position(t, 'moon').longitude] as const;
  const elongationAt: AngleAt = (t) => elongation(...sunMoon(t));
  const moonAt: AngleAt = (t) => eph.position(t, 'moon').longitude;
  const yogaAt: AngleAt = (t) => yogaAngle(...sunMoon(t));

  const span = (p: Period) => ({ start: engine.moment(p.startJd), end: engine.moment(p.endJd) });
  const tithis = periodsBetween(elongationAt, sunriseJd, nextSunriseJd, MAS_PER_TITHI)
    .map((p) => ({ ...tithiOf((p.index + 0.5) * TITHI_DEGREES), ...span(p) }));
  const nakshatras = periodsBetween(moonAt, sunriseJd, nextSunriseJd, MAS_PER_NAKSHATRA)
    .map((p) => {
      const { number, name, lord } = nakshatraOf((p.index + 0.5) * (MAS_PER_NAKSHATRA / MAS_PER_DEGREE));
      return { number, name, lord, ...span(p) };
    });
  const yogas = periodsBetween(yogaAt, sunriseJd, nextSunriseJd, MAS_PER_NAKSHATRA)
    .map((p) => ({ ...yogaOf((p.index + 0.5) * (MAS_PER_NAKSHATRA / MAS_PER_DEGREE)), ...span(p) }));
  const karanas = periodsBetween(elongationAt, sunriseJd, nextSunriseJd, MAS_PER_KARANA)
    .map((p) => ({ ...karanaOf((p.index + 0.5) * KARANA_DEGREES), ...span(p) }));

  const periods = dayPeriods({ weekday, sunriseJd, sunsetJd, nextSunriseJd, previousSunsetJd })
    .map(({ startJd, endJd, ...period }) => ({ ...period, start: engine.moment(startJd), end: engine.moment(endJd) }));

  const [sun, moon] = sunMoon(jd.ut1);
  return {
    input: echo(input),
    day: {
      vara: varaOf(weekday),
      sunrise: engine.moment(sunriseJd),
      sunset: sunsetJd === null ? null : engine.moment(sunsetJd),
      nextSunrise: engine.moment(nextSunriseJd),
      moonrise: moonriseJd === null ? null : engine.moment(moonriseJd),
      moonset: moonsetJd === null ? null : engine.moment(moonsetJd),
    },
    tithis,
    nakshatras,
    yogas,
    karanas,
    periods,
    atReferenceTime: {
      tithi: tithiOf(elongation(sun, moon)),
      nakshatra: nakshatraOf(moon),
      yoga: yogaOf(yogaAngle(sun, moon)),
      karana: karanaOf(elongation(sun, moon)),
      vara: varaAt(input, jd.ut1, sunriseJd),
    },
    meta: { ...engine.meta(jd, eph.position(jd.ut1, 'moon').flag), calculatedAt: new Date().toISOString() },
  };
}
