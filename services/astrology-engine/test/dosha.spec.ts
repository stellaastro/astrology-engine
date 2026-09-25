import { describe, expect, it } from 'vitest';
import { computeChart } from '../src/chart';
import { toMilliarcseconds } from '../src/jyotish/angles';
import { kaalSarpOf, manglikOf } from '../src/jyotish/dosha';
import type { Graha } from '../src/jyotish/rashi';
import { saturnSignChanges } from '../src/sade-sati';
import { inputAt, JHORA_CONFIG, makeEngine } from './helpers';

/** A longitude in the middle of a sign, 1 = Aries. */
const sign = (n: number) => (n - 1) * 30 + 15;

describe('Manglik: Mars in the 1st, 4th, 7th, 8th or 12th, from Lagna, Moon and Venus', () => {
  it('counts whole signs from each reference and never counts the 2nd silently', () => {
    const lagna = sign(1);
    for (let house = 1; house <= 12; house++) {
      const r = manglikOf(sign(house), { lagna, moon: sign(1), venus: sign(1) });
      expect(r.fromLagna).toEqual({ house, manglik: [1, 4, 7, 8, 12].includes(house), secondHouse: house === 2 });
    }
  });
  it('is present from the Lagna or the Moon; Venus is reported, not counted', () => {
    const mars = sign(7);
    expect(manglikOf(mars, { lagna: sign(1), moon: sign(3), venus: sign(3) }).present).toBe(true); // 7th from Lagna
    expect(manglikOf(mars, { lagna: sign(3), moon: sign(12), venus: sign(3) }).present).toBe(true); // 8th from Moon
    const venusOnly = manglikOf(mars, { lagna: sign(3), moon: sign(3), venus: sign(12) });
    expect(venusOnly.fromVenus.manglik).toBe(true);
    expect(venusOnly.present).toBe(false);
  });
});

describe('Kaal Sarp: all seven planets on one side of the Rahu–Ketu axis', () => {
  const chart = (rahu: number, others: number[]) => ({
    rahu, ketu: (rahu + 180) % 360,
    ...Object.fromEntries((['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as Graha[]).map((id, i) => [id, others[i]!])),
  }) as Record<Graha, number>;
  it('from Rahu to Ketu, named by Rahu\'s house from the Lagna', () => {
    const k = kaalSarpOf(chart(10, [20, 40, 60, 80, 100, 120, 185]), sign(1));
    expect(k).toEqual({ present: true, hemmed: 'rahu_to_ketu', bySign: { present: true, hemmed: 'rahu_to_ketu' }, type: 'Anant', rahuHouse: 1, outside: [] });
  });
  it('by sign, a planet in Ketu\'s own sign counts as enclosed; by longitude it does not', () => {
    // Rahu 10° Aries, Ketu 10° Libra; Saturn 5° Libra is before Ketu by longitude... and 15° Libra after it.
    const inside = kaalSarpOf(chart(10, [20, 40, 60, 80, 100, 120, 185]), sign(1));
    const across = kaalSarpOf(chart(10, [20, 40, 60, 80, 100, 120, 195]), sign(1));
    expect(inside.present && inside.bySign.present).toBe(true);
    expect(across).toMatchObject({ present: false, outside: ['saturn'], bySign: { present: true, hemmed: 'rahu_to_ketu' }, type: 'Anant' });
  });
  it('from Ketu to Rahu', () => {
    const k = kaalSarpOf(chart(100, [300, 290, 285, 330, 350, 5, 95]), sign(4));
    expect(k).toMatchObject({ present: true, hemmed: 'ketu_to_rahu', type: 'Anant', rahuHouse: 1 });
  });
  it('is absent when one planet is across the axis, and names it', () => {
    const k = kaalSarpOf(chart(10, [20, 40, 60, 80, 100, 120, 250]), sign(1)); // Saturn in Sagittarius
    expect(k).toMatchObject({ present: false, hemmed: null, type: null, outside: ['saturn'], bySign: { present: false } });
  });
});

describe('Sade Sati: Saturn\'s sidereal sign changes', () => {
  const engine = makeEngine(JHORA_CONFIG);
  const signAt = (jd: number) => Math.floor(toMilliarcseconds(engine.eph.position(jd, 'saturn').longitude) / 108_000_000);

  it('finds every change a day-by-day scan finds, each to the second', () => {
    const [from, to] = [2_451_545, 2_451_545 + 30 * 365.25]; // 2000–2030
    const fast = saturnSignChanges(engine, from, to);
    const daily: number[] = [];
    for (let t = from, s = signAt(from); t < to; t++) { const n = signAt(t + 1); if (n !== s) daily.push(t + 1); s = n; }
    expect(fast.length).toBe(daily.length);
    fast.forEach((c, i) => {
      expect(Math.abs(c.jd - daily[i]!)).toBeLessThan(1);
      expect(signAt(c.jd - 1 / 86_400)).toBe(c.from);
      expect(signAt(c.jd + 1 / 86_400)).toBe(c.to);
    });
    // 2012: Saturn went back from Libra into Virgo and forward again.
    const virgoLibra = fast.filter((c) => [5, 6].includes(c.from) && [5, 6].includes(c.to));
    expect(virgoLibra.length).toBe(3);
  });

  it('reports whole cycles that overlap the life, with the phases in order', () => {
    const chart = computeChart(engine, inputAt('2000-01-01T06:30:00Z', 28.6139, 77.209));
    const s = chart.doshas.sadeSati;
    expect(s.moonSign).toBe(7); // Libra: Virgo rising, Libra peak, Scorpio setting
    const first = s.cycles.find((c) => c.phases.length > 2)!;
    expect(first.phases.map((p) => p.sign)).toEqual(['Virgo', 'Libra', 'Virgo', 'Libra', 'Scorpio']);
    expect(first.start!.slice(0, 10)).toBe('2009-09-09');
    for (const c of s.cycles) for (let i = 1; i < c.phases.length; i++) expect(c.phases[i]!.start).toBe(c.phases[i - 1]!.end);
    expect(s.dhaiya.map((d) => d.kind)).toContain('eighth'); // Saturn in Taurus from mid-2000
  });
});
