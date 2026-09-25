// Every angle in the engine goes through these. Raw `% 360` elsewhere is a bug:
// JavaScript's remainder keeps the sign of the dividend, and a value a hair
// below zero rounds up to exactly 360 after adding 360, which is not in [0, 360).

/** Degrees → [0, 360). */
export function normalize360(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new RangeError(`not a finite angle: ${degrees}`);
  const r = degrees % 360;
  const wrapped = r < 0 ? r + 360 : r;
  // -1e-15 + 360 is 360 in floating point.
  return wrapped >= 360 ? 0 : wrapped + 0; // `+ 0` turns -0 into 0
}

/** Degrees → [-180, 180). The shortest signed step from one direction to another. */
export function normalizeSigned180(degrees: number): number {
  const r = normalize360(degrees);
  return r >= 180 ? r - 360 : r;
}

/**
 * Carry an angle across the 360° seam. Given the previous UNWRAPPED value and a
 * new reading in [0, 360), return the new reading on the same continuous scale:
 * 359.999° followed by 0.001° becomes 360.001°, not 0.001°.
 *
 * Valid only while the true change between readings is under 180°, which every
 * caller guarantees by stepping in hours, not days.
 */
export function unwrapForwardAngle(previousUnwrapped: number, reading: number): number {
  return previousUnwrapped + normalizeSigned180(reading - previousUnwrapped);
}

/**
 * Longitude → whole milliarcseconds in [0, 1_296_000_000). Division into signs,
 * nakshatras and padas is done on this integer so a boundary belongs to exactly
 * one side: 13°20′ is Bharani, and anything below it, however close, is Ashwini.
 */
export function toMilliarcseconds(longitude: number): number {
  const mas = Math.floor(normalize360(longitude) * 3_600_000);
  return mas >= 1_296_000_000 ? 0 : mas;
}

export const MAS_PER_DEGREE = 3_600_000;
