import { describe, expect, it } from 'vitest';
import { normalize360, normalizeSigned180, toMilliarcseconds, unwrapForwardAngle } from '../src/jyotish/angles';

describe('normalize360', () => {
  it('maps every angle into [0, 360)', () => {
    expect(normalize360(0)).toBe(0);
    expect(normalize360(360)).toBe(0);
    expect(normalize360(720.5)).toBeCloseTo(0.5, 12);
    expect(normalize360(-1)).toBe(359);
    expect(normalize360(-179)).toBe(181);
  });
  it('never returns 360 for a value a hair below zero', () => {
    // -1e-15 + 360 === 360 in floating point.
    expect(normalize360(-1e-15)).toBe(0);
    expect(normalize360(-1e-15)).toBeLessThan(360);
  });
  it('never returns negative zero', () => {
    expect(Object.is(normalize360(-0), 0)).toBe(true);
    expect(Object.is(normalize360(-360), 0)).toBe(true);
  });
  it('refuses non-finite input rather than propagating NaN', () => {
    expect(() => normalize360(Number.NaN)).toThrow(RangeError);
    expect(() => normalize360(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('normalizeSigned180', () => {
  it('gives the shortest signed step', () => {
    expect(normalizeSigned180(0.002 - 359.998)).toBeCloseTo(0.004, 9);
    expect(normalizeSigned180(359.998 - 0.002)).toBeCloseTo(-0.004, 9);
    expect(normalizeSigned180(180)).toBe(-180);
    expect(normalizeSigned180(179.999)).toBeCloseTo(179.999, 9);
  });
});

describe('unwrapForwardAngle', () => {
  it('carries 359.999° → 0.001° forward to 360.001°', () => {
    expect(unwrapForwardAngle(359.999, 0.001)).toBeCloseTo(360.001, 9);
  });
  it('carries 0.001° → 359.999° backward to -0.001°', () => {
    expect(unwrapForwardAngle(0.001, 359.999)).toBeCloseTo(-0.001, 9);
  });
  it('keeps accumulating across several turns', () => {
    let u = 350;
    for (const reading of [355, 0, 5, 10, 355, 0.5]) u = unwrapForwardAngle(u, reading);
    // 350 → 355 → 360 → 365 → 370 → 355 (back 15) → 360.5
    expect(u).toBeCloseTo(360.5, 9);
  });
});

describe('toMilliarcseconds', () => {
  it('is exact on division boundaries', () => {
    expect(toMilliarcseconds(30)).toBe(108_000_000);
    expect(toMilliarcseconds(40 / 3)).toBe(48_000_000);
    expect(toMilliarcseconds(359.9999999999)).toBeLessThan(1_296_000_000);
    expect(toMilliarcseconds(360)).toBe(0);
  });
});
