import { describe, expect, it } from 'vitest';
import { DIVISIONS, navamsaSignNumber, vargaSignNumber, type Division } from '../src/jyotish/varga';

const MAS = 1 / 3_600_000;

// A second, independent encoding in the style of PyJHora's
// horoscope/chart/charts.py "Traditional Parasara" branches: degrees within
// the sign, the part number l = floor(deg / (30/n)), and a start sign per
// rule. 0 = Aries here; the engine answers 1 = Aries.
function reference(n: Division, longitude: number): number {
  const sign = Math.floor(longitude / 30);
  const deg = longitude - sign * 30;
  const l = Math.floor(deg / (30 / n));
  const odd = sign % 2 === 0;
  const movable = [0, 3, 6, 9].includes(sign), fixed = [1, 4, 7, 10].includes(sign);
  const r = (() => {
    switch (n) {
      case 1: return sign;
      case 2: return odd ? (l === 0 ? 4 : 3) : (l === 0 ? 3 : 4);
      case 3: return sign + [0, 4, 8][l]!;
      case 4: return sign + [0, 3, 6, 9][l]!;
      case 7: return (odd ? sign : sign + 6) + l;
      case 9: return Math.floor(longitude / (10 / 3));
      case 10: return (odd ? sign : sign + 8) + l;
      case 12: return sign + l;
      case 16: return l + (movable ? 0 : fixed ? 4 : 8);
      case 20: return l + (movable ? 0 : fixed ? 8 : 4);
      case 24: return l + (odd ? 4 : 3);
      case 27: return l + [0, 3, 6, 9][sign % 4]!;
      case 30: return odd
        ? (deg < 5 ? 0 : deg < 10 ? 10 : deg < 18 ? 8 : deg < 25 ? 2 : 6)
        : (deg < 5 ? 1 : deg < 12 ? 5 : deg < 20 ? 11 : deg < 25 ? 9 : 7);
      case 40: return l + (odd ? 0 : 6);
      case 45: return l + (movable ? 0 : fixed ? 4 : 8);
      case 60: return sign + l;
    }
  })();
  return (r % 12) + 1;
}

/** Distance in degrees from `longitude` to the nearest part boundary of division n. */
function nearBoundary(n: Division, longitude: number): number {
  const edges = n === 30 ? [0, 5, 10, 12, 18, 20, 25, 30] : Array.from({ length: n + 1 }, (_, i) => (30 * i) / n);
  const deg = longitude % 30;
  return Math.min(...edges.map((e) => Math.abs(deg - e)));
}

describe('divisional charts: the sixteen Parashari vargas', () => {
  it.each(DIVISIONS.map((n) => [n]))('D%i agrees with the independent encoding on 20,000 longitudes', (n) => {
    let seed = n * 7919;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let checked = 0;
    for (let i = 0; i < 20_000; i++) {
      const longitude = random() * 360;
      if (nearBoundary(n, longitude) < 1e-6) continue; // floating point may land either side
      expect(vargaSignNumber(n, longitude), `D${n} at ${longitude}`).toBe(reference(n, longitude));
      checked++;
    }
    expect(checked).toBeGreaterThan(19_900);
  });

  it('D9 is the navamsa the chart already reported', () => {
    for (let mas = 0; mas < 1_296_000_000; mas += 1_234_567) {
      const longitude = mas / 3_600_000;
      expect(navamsaSignNumber(longitude)).toBe((Math.floor(mas / 12_000_000) % 12) + 1);
    }
  });

  it('a part starts exactly at its boundary, never a milliarcsecond early', () => {
    // Aries 5°: D30 Mars (Aries) → Saturn (Aquarius). Taurus 12°: Mercury (Virgo) → Jupiter (Pisces).
    expect(vargaSignNumber(30, 5 - MAS)).toBe(1);
    expect(vargaSignNumber(30, 5)).toBe(11);
    expect(vargaSignNumber(30, 42 - MAS)).toBe(6);
    expect(vargaSignNumber(30, 42)).toBe(12);
    // D2 at 15°: odd sign Leo → Cancer, even sign Cancer → Leo.
    expect([vargaSignNumber(2, 15 - MAS), vargaSignNumber(2, 15)]).toEqual([5, 4]);
    expect([vargaSignNumber(2, 45 - MAS), vargaSignNumber(2, 45)]).toEqual([4, 5]);
    // D60 at Aries 0°30′ → next sign; the last part of Pisces wraps to Aquarius.
    expect([vargaSignNumber(60, 0.5 - MAS), vargaSignNumber(60, 0.5)]).toEqual([1, 2]);
    expect(vargaSignNumber(60, 360 - MAS)).toBe(11);
    // 360° is 0° Aries in every varga.
    for (const n of DIVISIONS) expect(vargaSignNumber(n, 360)).toBe(vargaSignNumber(n, 0));
  });

  it('D7 and D10 of an even sign start from its 7th and 9th', () => {
    expect(vargaSignNumber(7, 30.1)).toBe(8); // Taurus → Scorpio
    expect(vargaSignNumber(10, 30.1)).toBe(10); // Taurus → Capricorn
    expect(vargaSignNumber(7, 0.1)).toBe(1); // Aries → Aries
    expect(vargaSignNumber(10, 0.1)).toBe(1);
  });

  it('D30 never falls in Cancer or Leo', () => {
    for (let d = 0; d < 360; d += 0.05) expect([4, 5]).not.toContain(vargaSignNumber(30, d));
  });
});
