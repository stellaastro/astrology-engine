import { toMilliarcseconds } from './angles';

// Divisional charts (vargas). Stage 2 has the Navamsa (D9).
//
// Navamsa: each sign is divided into nine parts of 3°20′, and the parts run
// on through the zodiac from 0° Aries, so the navamsa sign of a longitude is
// simply which 3°20′ step it falls in, counted from Aries, modulo 12. This
// gives the classical rule (movable signs start from themselves, fixed signs
// from the ninth, dual signs from the fifth) without special cases. Each
// nakshatra pada is exactly one navamsa. Checked against Jagannatha Hora on
// 13 charts (ADR-091).

const MAS_PER_NAVAMSA = 12_000_000; // 3°20′

/** 1 = Aries … 12 = Pisces. */
export function navamsaSignNumber(longitude: number): number {
  return (Math.floor(toMilliarcseconds(longitude) / MAS_PER_NAVAMSA) % 12) + 1;
}
