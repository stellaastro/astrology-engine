import { describe, expect, it } from 'vitest';
import { computeChart } from '../src/chart';
import { normalize360 } from '../src/jyotish/angles';
import { solarYearClock, vimshottari, VIMSHOTTARI } from '../src/jyotish/dasha';
import { navamsaSignNumber } from '../src/jyotish/varga';
import { inputAt, JHORA_CONFIG, makeEngine } from './helpers';

const NAK = 40 / 3;
const ARCSEC = 1 / 3600;

describe('navamsa (D9)', () => {
  it('steps one sign every 3°20′ from Aries, which gives the classical start signs', () => {
    expect(navamsaSignNumber(0)).toBe(1); // Aries (movable) starts from Aries
    expect(navamsaSignNumber(30)).toBe(10); // Taurus (fixed) starts from the 9th: Capricorn
    expect(navamsaSignNumber(60)).toBe(7); // Gemini (dual) starts from the 5th: Libra
    expect(navamsaSignNumber(90)).toBe(4); // Cancer (movable) starts from Cancer
    expect(navamsaSignNumber(NAK / 4 - ARCSEC)).toBe(1);
    expect(navamsaSignNumber(NAK / 4)).toBe(2);
    expect(navamsaSignNumber(360 - ARCSEC)).toBe(12);
  });
});

// A Sun that moves exactly 1° per day: every year-offset has an exact answer.
const linearSun = (l0: number) => (jd: number) => ({ longitude: normalize360(l0 + jd), speed: 1 });

describe('vimshottari arithmetic', () => {
  it('starts from the Moon\'s nakshatra lord with the unexpired balance, and runs 120 years in order', () => {
    // Moon a quarter of the way through Mula (a Ketu nakshatra): 3/4 of Ketu's 7 years remain.
    const moon = 18 * NAK + NAK / 4;
    const d = vimshottari(moon, 1, solarYearClock(linearSun(10), 0));
    expect(d.firstLord).toBe('ketu');
    expect(d.balanceYears).toBeCloseTo(5.25, 9);
    expect(d.periods.map((p) => p.lord)).toEqual(VIMSHOTTARI.map(([lord]) => lord));
    const days = (years: number) => years * 360; // 1°/day, 360° per year
    expect(d.periods[0]!.startJd).toBeCloseTo(-days(1.75), 4); // began before birth
    expect(d.periods[0]!.endJd).toBeCloseTo(days(5.25), 4);
    expect(d.periods[8]!.endJd - d.periods[0]!.startJd).toBeCloseTo(days(120), 3);
    for (let i = 1; i < 9; i++) expect(d.periods[i]!.startJd).toBe(d.periods[i - 1]!.endJd);
  });

  it('divides each period in proportion, each sequence starting from its own lord', () => {
    const d = vimshottari(0, 3, solarYearClock(linearSun(0), 0)); // Ashwini at 0°: all of Ketu remains
    const venus = d.periods[1]!;
    expect(venus.lord).toBe('venus');
    expect(venus.periods!.map((p) => p.lord)).toEqual(['venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury', 'ketu']);
    const venusSun = venus.periods![1]!;
    expect(venusSun.endJd - venusSun.startJd).toBeCloseTo((20 * 6 / 120) * 360, 4); // one year
    expect(venusSun.periods!.map((p) => p.lord)[0]).toBe('sun');
    expect(venusSun.periods![0]!.endJd - venusSun.periods![0]!.startJd).toBeCloseTo((1 * 6 / 120) * 360, 4);
    expect(venus.periods![8]!.endJd).toBe(venus.endJd);
  });
});

describe('true sidereal solar years on the real ephemeris', () => {
  it('puts every mahadasha boundary where the Sun is a whole number of turns past its birth longitude', () => {
    const engine = makeEngine(JHORA_CONFIG);
    const chart = computeChart(engine, inputAt('1972-04-05T05:05:00Z', 8.7139, 77.7567));
    const birthSun = chart.planets[0]!.longitude;
    const moon = chart.planets[1]!.longitude;
    const elapsed = (moon % NAK) / NAK;
    let years = (1 - elapsed) * 7; // Mula: Ketu, 7 years
    for (const [i, p] of (chart.dasha.periods as { lord: string; end: string }[]).entries()) {
      if (i > 0) years += VIMSHOTTARI[(i) % 9]![1];
      const jd = Date.parse(p.end) / 86_400_000 + 2440587.5;
      const sun = engine.eph.position(jd, 'sun').longitude;
      const want = normalize360(birthSun + (years % 1) * 360);
      const gap = Math.abs(((sun - want + 540) % 360) - 180) * 3600;
      // The boundary is read back from civil UTC rounded to the second (±0.5 s),
      // and UTC is within 0.9 s of the UT1 the engine works in: at most ~1.4 s,
      // which is 0.06″ of Sun. Anything wider would be a wrong boundary.
      expect(gap, `${p.lord} ends ${p.end}`).toBeLessThan(0.1);
    }
  });
});

describe('a dasha that runs past the ephemeris', () => {
  // The dasha reaches from the first mahadasha's start (up to 20 years before
  // birth) to 120 years after it. Near 1801 or 2398 part of that is outside the
  // pinned files; those dates are unknown, and the chart must still calculate.
  const engine = makeEngine(JHORA_CONFIG);
  const flat = (periods: { start: string | null; end: string | null; periods?: unknown[] }[]): { start: string | null; end: string | null }[] =>
    periods.flatMap((p) => [p, ...(p.periods ? flat(p.periods as never) : [])]);

  it.each([['1801-06-01T06:30:00Z', 'start'], ['2398-12-31T06:30:00Z', 'end']])('%s: calculates, with the %s of the dasha unknown', (utc, missing) => {
    const chart = computeChart(engine, inputAt(utc, 28.6139, 77.209));
    const all = flat(chart.dasha.periods as never);
    const nulls = all.filter((p) => (missing === 'start' ? p.start === null : p.end === null));
    expect(nulls.length).toBeGreaterThan(0);
    for (const p of all) for (const iso of [p.start, p.end]) if (iso !== null) expect(Number.isNaN(Date.parse(iso))).toBe(false);
    // Known dates never go beyond the files.
    const known = all.flatMap((p) => [p.start, p.end]).filter((x): x is string => x !== null).map(Date.parse);
    expect(Math.min(...known)).toBeGreaterThanOrEqual(Date.parse('1800-01-01T00:00:00Z'));
    expect(Math.max(...known)).toBeLessThanOrEqual(Date.parse('2400-01-01T00:00:00Z'));
  });

  it('an ordinary birth has every date', () => {
    const chart = computeChart(engine, inputAt('2000-01-01T06:30:00Z', 28.6139, 77.209));
    expect(flat(chart.dasha.periods as never).every((p) => p.start !== null && p.end !== null)).toBe(true);
  });
});
