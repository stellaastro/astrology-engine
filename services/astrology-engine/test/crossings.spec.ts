import { describe, expect, it } from 'vitest';
import { normalize360 } from '../src/jyotish/angles';
import { ONE_SECOND, periodAround, periodsBetween } from '../src/jyotish/crossings';

// A synthetic angle moving 13°/day that passes through the 360° seam at
// t = 10/13 day. Exact answers are known, so the search can be checked alone.
const RATE = 13;
const angle = (start: number) => (jd: number) => normalize360(start + RATE * jd);
const DIV_12 = 12 * 3_600_000;
const DIV_NAK = 48_000_000;

describe('crossings through 359.999° → 0.001°', () => {
  it('finds a boundary sitting exactly on the seam, searching forward', () => {
    const p = periodAround(angle(350), 0, DIV_12); // 350° is in [348, 360)
    expect(p.index).toBe(29);
    expect(Math.abs(p.endJd - 10 / 13)).toBeLessThan(ONE_SECOND);
    expect(Math.abs(p.startJd - -2 / 13)).toBeLessThan(ONE_SECOND);
  });

  it('finds a boundary on the seam searching backward from just past it', () => {
    const p = periodAround(angle(0.001), 0, DIV_12); // just after the seam
    expect(p.index).toBe(0);
    expect(Math.abs(p.startJd - -0.001 / RATE)).toBeLessThan(ONE_SECOND);
    expect(Math.abs(p.endJd - (12 - 0.001) / RATE)).toBeLessThan(ONE_SECOND);
  });

  it('returns the first instant AFTER the boundary, so the next period is never the same one', () => {
    const p = periodAround(angle(359.999), 0, DIV_NAK);
    expect(p.index).toBe(26);
    expect(angle(359.999)(p.endJd)).toBeLessThan(1); // past the seam, in Ashwini
    expect(periodAround(angle(359.999), p.endJd, DIV_NAK).index).toBe(0);
  });

  it('lists contiguous periods across the seam without repeating or skipping', () => {
    const periods = periodsBetween(angle(340), 0, 3, DIV_NAK);
    // 340° + 13°/day × 3 days reaches 19°: through 26 (to 360°), 0 (to 13°20′), into 1.
    expect(periods.map((p) => p.index)).toEqual([25, 26, 0, 1]);
    for (let i = 1; i < periods.length; i++) expect(periods[i]!.startJd).toBe(periods[i - 1]!.endJd);
    // 360° is reached at (360 − 340) / 13 days.
    expect(Math.abs(periods[1]!.endJd - 20 / 13)).toBeLessThan(ONE_SECOND);
  });

  it('works for an angle whose readings step over the seam between samples', () => {
    // Faster than any real limb: 170°/day, still under the 180° a half-day step allows.
    const fast = (jd: number) => normalize360(359.999 + 170 * jd);
    const p = periodAround(fast, 0, DIV_12);
    expect(p.index).toBe(29);
    expect(Math.abs(p.endJd - 0.001 / 170)).toBeLessThan(ONE_SECOND);
  });
});
