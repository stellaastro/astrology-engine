import { MAS_PER_DEGREE, toMilliarcseconds, unwrapForwardAngle } from './angles';

// When does a tithi, nakshatra, yoga or karana end? Each is a fixed division of
// an angle that only ever increases (Moon − Sun, Moon, Sun + Moon), so the end
// is the moment that angle reaches the next boundary.
//
// The angle is read wrapped into [0, 360), and a boundary can sit on the seam:
// Revati ends at 360°, which the ephemeris reports as 0°. Bisecting the raw
// reading would see 359.99° → 0.01° as a fall of 359.98° and search the wrong
// way. So every search works on UNWRAPPED progress: each new reading is carried
// onto a continuous scale by unwrapForwardAngle, and only then compared.

/** Wrapped angle in [0, 360) at a Julian day (UT). Must increase with time. */
export type AngleAt = (jdUt: number) => number;

/** One second of time, in days: the precision every end time is found to. */
export const ONE_SECOND = 1 / 86_400;

// The fastest of these angles (Sun + Moon) moves under 17° a day. Half-day
// steps keep every step far below the 180° the unwrap needs.
const STEP_DAYS = 0.5;
// The longest division (a nakshatra or yoga) lasts under 30 hours.
const MAX_SEARCH_DAYS = 3;

export class CrossingNotFound extends Error {}

export interface Period {
  /** 0-based division index: 0 = Ashwini, Shukla Pratipada, Vishkambha, Kimstughna. */
  index: number;
  /** First instant, to one second, at which this division is in force. */
  startJd: number;
  /** First instant, to one second, at which the next division is in force. */
  endJd: number;
}

/**
 * The division in force at `jd`, with its start and end.
 * `divisionMas` is the division's size in milliarcseconds.
 */
export function periodAround(angleAt: AngleAt, jd: number, divisionMas: number): Period {
  const reading = angleAt(jd);
  const index = Math.floor(toMilliarcseconds(reading) / divisionMas);
  const size = divisionMas / MAS_PER_DEGREE;
  const start = index * size;
  // `reading` is already continuous with [start, start + size): no unwrap needed.
  return {
    index,
    startJd: searchBackward(angleAt, jd, reading, start),
    endJd: searchForward(angleAt, jd, reading, start + size),
  };
}

/**
 * Every division that is in force at any moment of [fromJd, toJd), in order.
 * The first may have started before `fromJd`, and the last may end after `toJd`.
 */
export function periodsBetween(angleAt: AngleAt, fromJd: number, toJd: number, divisionMas: number): Period[] {
  const count = Math.round((360 * MAS_PER_DEGREE) / divisionMas);
  const size = divisionMas / MAS_PER_DEGREE;
  const periods = [periodAround(angleAt, fromJd, divisionMas)];
  for (let current = periods[0]!; current.endJd < toJd; ) {
    const index = (current.index + 1) % count;
    // The boundary just crossed, on the scale where this period's own start is
    // `index * size` (so the Revati → Ashwini boundary is 0, not 360).
    const boundary = index * size;
    const reading = unwrapForwardAngle(boundary, angleAt(current.endJd));
    current = { index, startJd: current.endJd, endJd: searchForward(angleAt, current.endJd, reading, boundary + size) };
    periods.push(current);
  }
  return periods;
}

/** First time ≥ t0 at which the unwrapped angle reaches `target` (> u0). */
export function searchForward(angleAt: AngleAt, t0: number, u0: number, target: number): number {
  let tPrev = t0;
  let uPrev = u0;
  if (uPrev >= target) return t0;
  for (let travelled = 0; travelled < MAX_SEARCH_DAYS; travelled += STEP_DAYS) {
    const t = tPrev + STEP_DAYS;
    const u = unwrapForwardAngle(uPrev, angleAt(t));
    if (u >= target) return bisect(angleAt, tPrev, uPrev, t, target);
    tPrev = t;
    uPrev = u;
  }
  throw new CrossingNotFound(`angle did not reach ${target}° within ${MAX_SEARCH_DAYS} days of JD ${t0}`);
}

/** Latest time ≤ t0 at which the unwrapped angle first reaches `target` (≤ u0). */
export function searchBackward(angleAt: AngleAt, t0: number, u0: number, target: number): number {
  let tNext = t0;
  let uNext = u0;
  for (let travelled = 0; travelled < MAX_SEARCH_DAYS; travelled += STEP_DAYS) {
    const t = tNext - STEP_DAYS;
    const u = unwrapForwardAngle(uNext, angleAt(t));
    if (u < target) return bisect(angleAt, t, u, tNext, target);
    tNext = t;
    uNext = u;
  }
  throw new CrossingNotFound(`angle was not below ${target}° within ${MAX_SEARCH_DAYS} days before JD ${t0}`);
}

/**
 * Given u(lo) < target ≤ u(hi), narrow to one second and return the upper end:
 * the first instant found at which the angle has reached the target. Returning
 * the upper end makes `periodAround(end)` land in the NEXT division, always.
 */
function bisect(angleAt: AngleAt, lo: number, uLo: number, hi: number, target: number): number {
  while (hi - lo > ONE_SECOND) {
    const mid = (lo + hi) / 2;
    const uMid = unwrapForwardAngle(uLo, angleAt(mid));
    if (uMid >= target) hi = mid;
    else {
      lo = mid;
      uLo = uMid;
    }
  }
  return hi;
}
