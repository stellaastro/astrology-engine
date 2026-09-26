import type { Engine } from './engine';
import { EPHEMERIS_JD } from './ephemeris';
import { normalizeSigned180, toMilliarcseconds } from './jyotish/angles';

// Sade Sati: Saturn in the 12th, 1st and 2nd signs from the natal Moon's sign,
// about seven and a half years. Dhaiya (small panoti): Saturn in the 4th or
// the 8th sign from the Moon, about two and a half. Both are Saturn's own
// sidereal sign changes, found to the second; nothing is averaged.
//
// Saturn goes retrograde, so it can leave a sign and come back: its longitude
// is not monotonic and the panchang searches (crossings.ts) do not apply.
// Instead, sample every 15 days — Saturn never moves more than about 2° in
// that time, so it cannot cross a sign unseen unless it turns round (a
// station) near a boundary. Where it does, walk that stretch a day at a time,
// so an in-and-out around a station is never missed. (Within one day of a
// station Saturn moves under 0.02°; a double crossing inside that is not
// searched for.) Each change is then solved by Newton's method on Saturn's
// own speed, kept inside a bracket and falling back to bisection.

const MAS_PER_SIGN = 108_000_000;
const STEP_DAYS = 15;
/** Degrees from a boundary within which a station can hide a crossing. */
const NEAR_DEGREES = 2.5;
const SECOND = 1 / 86_400;
const YEAR = 365.25;

export interface SignChange { jd: number; from: number; to: number }

function saturnAt(engine: Engine, jd: number) {
  const p = engine.eph.position(jd, 'saturn');
  const mas = toMilliarcseconds(p.longitude);
  const sign = Math.floor(mas / MAS_PER_SIGN);
  const intoSign = (mas - sign * MAS_PER_SIGN) / 3_600_000;
  return { sign, direct: p.speed >= 0, near: intoSign < NEAR_DEGREES || intoSign > 30 - NEAR_DEGREES, longitude: p.longitude, speed: p.speed };
}

/** The instant Saturn passes from sign `from` to the adjacent sign `to`, within [lo, hi], to a second. */
function crossing(engine: Engine, lo: number, hi: number, from: number, to: number): SignChange {
  // Moving forward into `to`, the boundary is the start of `to`; moving back, the start of `from`.
  const boundary = (to === (from + 1) % 12 ? to : from) * 30;
  let t = (lo + hi) / 2;
  for (let i = 0; i < 60 && hi - lo > SECOND; i++) {
    const s = saturnAt(engine, t);
    if (s.sign === from) lo = t; else hi = t;
    const newton = t - normalizeSigned180(s.longitude - boundary) / s.speed;
    if (Number.isFinite(newton) && Math.abs(newton - t) < SECOND / 10) return { jd: newton, from, to };
    t = Number.isFinite(newton) && newton > lo && newton < hi ? newton : (lo + hi) / 2;
  }
  return { jd: hi, from, to };
}

/** Every sidereal sign change of Saturn in [fromJd, toJd], in order. 0 = Aries. */
export function saturnSignChanges(engine: Engine, fromJd: number, toJd: number): SignChange[] {
  const changes: SignChange[] = [];
  let t = fromJd;
  let a = saturnAt(engine, t);
  while (t < toJd) {
    const t2 = Math.min(t + STEP_DAYS, toJd);
    const b = saturnAt(engine, t2);
    if (a.direct !== b.direct && (a.near || b.near)) {
      // A station near a boundary: any number of crossings, so walk it.
      let u = t, ua = a;
      while (u < t2) {
        const u2 = Math.min(u + 1, t2);
        const ub = saturnAt(engine, u2);
        if (ub.sign !== ua.sign) changes.push(crossing(engine, u, u2, ua.sign, ub.sign));
        u = u2; ua = ub;
      }
    } else if (a.sign !== b.sign) {
      changes.push(crossing(engine, t, t2, a.sign, b.sign));
    }
    t = t2; a = b;
  }
  return changes;
}

type Phase = 'rising' | 'peak' | 'setting';
const PHASE: Record<number, Phase> = { 11: 'rising', 0: 'peak', 1: 'setting' };
const DHAIYA: Record<number, 'fourth' | 'eighth'> = { 3: 'fourth', 7: 'eighth' };

/** How far past birth the periods are listed. */
export const SADE_SATI_YEARS = 100;
const LIMITS = { firstJd: EPHEMERIS_JD.first, lastJd: EPHEMERIS_JD.last };

/**
 * Sade Sati cycles and Dhaiya spans that overlap [birthJd, birthJd + years].
 * The search runs 8 years either side, so a cycle already running at birth,
 * or still running at the end, is reported whole.
 */
export function sadeSatiOf(engine: Engine, moonSign: number, birthJd: number, years: number, limits = LIMITS) {
  const endJd = Math.min(birthJd + years * YEAR, limits.lastJd);
  const fromJd = Math.max(birthJd - 8 * YEAR, limits.firstJd);
  const toJd = Math.min(endJd + 8 * YEAR, limits.lastJd);
  const changes = saturnSignChanges(engine, fromJd, toJd);
  // Saturn's sign in each stretch between changes.
  const spans: { sign: number; start: number | null; end: number | null }[] = [];
  let sign = saturnAt(engine, fromJd).sign;
  let start: number | null = null; // before the searched window: unknown
  for (const c of changes) { spans.push({ sign, start, end: c.jd }); sign = c.to; start = c.jd; }
  spans.push({ sign, start, end: null });

  const relative = (s: number) => (s - moonSign + 12) % 12;
  const cycles: { start: number | null; end: number | null; phases: { phase: Phase; sign: number; start: number | null; end: number | null }[] }[] = [];
  for (const span of spans) {
    const phase = PHASE[relative(span.sign)];
    if (!phase) continue;
    const last = cycles[cycles.length - 1];
    if (last && last.end === span.start) { last.phases.push({ phase, ...span }); last.end = span.end; }
    else cycles.push({ start: span.start, end: span.end, phases: [{ phase, ...span }] });
  }
  const dhaiya = spans.filter((s) => DHAIYA[relative(s.sign)]).map((s) => ({ kind: DHAIYA[relative(s.sign)]!, ...s }));
  const overlaps = (s: { start: number | null; end: number | null }) => (s.end === null || s.end > birthJd) && (s.start === null || s.start < endJd);
  return { cycles: cycles.filter(overlaps), dhaiya: dhaiya.filter(overlaps), endJd };
}
