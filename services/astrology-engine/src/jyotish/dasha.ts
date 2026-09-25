import { MAS_PER_NAKSHATRA } from './nakshatra';
import { MAS_PER_DEGREE, normalize360, normalizeSigned180, toMilliarcseconds } from './angles';
import type { Graha } from './rashi';

// Vimshottari dasha, started from the Moon.
//
// The Moon's nakshatra at birth gives the first lord; the part of that
// nakshatra still to run gives the balance of its period. Periods divide in
// proportion: an antardasha of lord B inside a mahadasha of lord A lasts
// years(A) × years(B) / 120, and pratyantardashas divide antardashas the same
// way, each sequence starting from its own period's lord.
//
// A dasha "year" here is a TRUE SIDEREAL SOLAR YEAR: the time the Sun takes to
// advance 360° in the sidereal zodiac, measured with the same positions the
// chart uses. So the date of a boundary n years after birth is the moment the
// Sun has moved n × 360° beyond its birth longitude (Jagannatha Hora's
// default, "Using true sidereal solar years", ADR-091).

export const VIMSHOTTARI: readonly (readonly [Graha, number])[] = [
  ['ketu', 7], ['venus', 20], ['sun', 6], ['moon', 10], ['mars', 7], ['rahu', 18], ['jupiter', 16], ['saturn', 19], ['mercury', 17],
];
const TOTAL_YEARS = 120;

export interface DashaPeriod {
  lord: Graha;
  /** 1 = mahadasha, 2 = antardasha, 3 = pratyantardasha. */
  level: 1 | 2 | 3;
  startJd: number;
  endJd: number;
  periods?: DashaPeriod[];
}

export interface Vimshottari {
  firstLord: Graha;
  /** Years of the first mahadasha still to run at birth. */
  balanceYears: number;
  periods: DashaPeriod[];
}

interface Span { lord: Graha; level: 1 | 2 | 3; start: number; end: number; periods?: Span[] }

/** Split a span of `years` starting at year-offset `start` into its nine sub-periods. */
function subdivide(lordIndex: number, start: number, years: number, level: 2 | 3, depth: number): Span[] {
  const out: Span[] = [];
  let t = start;
  for (let k = 0; k < 9; k++) {
    const [lord, share] = VIMSHOTTARI[(lordIndex + k) % 9]!;
    const length = (years * share) / TOTAL_YEARS;
    const span: Span = { lord, level, start: t, end: t + length };
    if (level < depth) span.periods = subdivide((lordIndex + k) % 9, t, length, 3, depth);
    out.push(span);
    t += length;
  }
  return out;
}

/**
 * The full Vimshottari timeline. `yearsToJd` turns year-offsets from birth
 * (negative before birth) into Julian days; it receives every boundary at once,
 * sorted, so it can convert them in one pass.
 */
export function vimshottari(moonLongitude: number, depth: 1 | 2 | 3, yearsToJd: (offsets: number[]) => Map<number, number>): Vimshottari {
  // Which nakshatra: from whole milliarcseconds, like every other label. How
  // far through it: from the exact longitude. The balance multiplies the
  // Moon's position by up to 20 years, so a 1-milliarcsecond rounding here
  // would move every boundary by several seconds.
  const nakshatra = Math.floor(toMilliarcseconds(moonLongitude) / MAS_PER_NAKSHATRA);
  const size = MAS_PER_NAKSHATRA / MAS_PER_DEGREE;
  const elapsed = Math.min(Math.max((normalize360(moonLongitude) - nakshatra * size) / size, 0), 1);
  const first = nakshatra % 9;
  const [firstLord, firstYears] = VIMSHOTTARI[first]!;

  const spans: Span[] = [];
  let t = -elapsed * firstYears;
  for (let k = 0; k < 9; k++) {
    const index = (first + k) % 9;
    const [lord, years] = VIMSHOTTARI[index]!;
    const span: Span = { lord, level: 1, start: t, end: t + years };
    if (depth > 1) span.periods = subdivide(index, t, years, 2, depth);
    spans.push(span);
    t += years;
  }

  const offsets = new Set<number>();
  const collect = (list: Span[]) => { for (const s of list) { offsets.add(s.start); offsets.add(s.end); if (s.periods) collect(s.periods); } };
  collect(spans);
  const jd = yearsToJd([...offsets].sort((a, b) => a - b));
  const toPeriod = (s: Span): DashaPeriod => {
    const p: DashaPeriod = { lord: s.lord, level: s.level, startJd: jd.get(s.start)!, endJd: jd.get(s.end)! };
    if (s.periods) p.periods = s.periods.map(toPeriod);
    return p;
  };
  return { firstLord, balanceYears: (1 - elapsed) * firstYears, periods: spans.map(toPeriod) };
}

/**
 * Year-offsets → Julian days by the Sun's own motion: offset y is the moment
 * the Sun's unwrapped longitude is y × 360° past its longitude at birth.
 *
 * Newton's method on the Sun's longitude, using the speed Swiss Ephemeris
 * returns with it, from a guess taken off the previous boundary: one to three
 * ephemeris calls per boundary instead of a sweep through every few days.
 * Each reading is unwrapped against the TARGET, not the previous reading, so a
 * jump of many years cannot slip by a whole turn: the guess is always within a
 * degree or two of the answer.
 */
export function solarYearClock(sunAt: (jd: number) => { longitude: number; speed: number }, birthJd: number): (offsets: number[]) => Map<number, number> {
  const HALF_SECOND = 0.5 / 86_400;
  const MEAN_SPEED = 360 / 365.256363; // degrees per day
  return (offsets) => {
    const out = new Map<number, number>();
    const birth = sunAt(birthJd);
    const l0 = birth.longitude;
    for (const direction of [1, -1] as const) {
      const targets = offsets.filter((y) => (direction > 0 ? y >= 0 : y < 0)).sort((a, b) => direction * (a - b));
      let [tPrev, uPrev, speedPrev] = [birthJd, l0, birth.speed];
      for (const years of targets) {
        const target = l0 + years * 360;
        // Short hops use the local speed; long ones the mean, which is closer over a year or more.
        const gap = target - uPrev;
        let t = tPrev + gap / (Math.abs(gap) > 30 ? MEAN_SPEED : speedPrev);
        let reading = sunAt(t);
        for (let i = 0; ; i++) {
          const u = target + normalizeSigned180(reading.longitude - target);
          const step = (target - u) / reading.speed;
          t += step;
          if (Math.abs(step) < HALF_SECOND) break;
          if (i >= 12 || !(reading.speed > 0)) throw new Error(`the Sun did not converge on ${years} years after birth`);
          reading = sunAt(t);
        }
        out.set(years, t);
        [tPrev, uPrev, speedPrev] = [t, target, reading.speed];
      }
    }
    return out;
  };
}
