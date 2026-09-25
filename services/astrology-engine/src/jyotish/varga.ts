import { toMilliarcseconds } from './angles';

// Divisional charts (vargas): the sixteen of Parashara (the shodasavarga),
// each by its Parashari rule. A sign of 30° is cut into n equal parts; which
// part a longitude falls in, and the sign that part is counted from, give the
// varga sign. Worked in integer milliarcseconds, so no boundary ever rounds:
// part = floor(mas-in-sign × n / 30°), exact for every n here.
//
// Navamsa: the parts run on through the zodiac from 0° Aries, so the navamsa
// sign is simply which 3°20′ step a longitude falls in, modulo 12. That is the
// classical rule (movable signs from themselves, fixed from the ninth, dual
// from the fifth) without special cases; each nakshatra pada is one navamsa.
//
// Where Jagannatha Hora offers several methods, the Parashari one is used —
// for D2 that is NOT JHora's default ("Uma-Shambhu") but its "Parasara hora
// (Cn-Le interpretation)". Checked against JHora's own text copy of each
// chart (ADR-091).

const MAS_PER_SIGN = 108_000_000; // 30°
const MAS_PER_NAVAMSA = 12_000_000; // 3°20′

export const DIVISIONS = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60] as const;
export type Division = (typeof DIVISIONS)[number];

export const VARGA_NAMES: Record<Division, string> = {
  1: 'Rasi', 2: 'Hora', 3: 'Drekkana', 4: 'Chaturthamsa', 7: 'Saptamsa', 9: 'Navamsa',
  10: 'Dasamsa', 12: 'Dwadasamsa', 16: 'Shodasamsa', 20: 'Vimsamsa', 24: 'Chaturvimsamsa',
  27: 'Saptavimsamsa', 30: 'Trimsamsa', 40: 'Khavedamsa', 45: 'Akshavedamsa', 60: 'Shashtiamsa',
};

/** The rule of each varga, in words, for meta.config. */
export const VARGA_RULES: Record<Division, string> = {
  1: 'the sign itself',
  2: 'Parashara (Cancer-Leo): odd signs Leo then Cancer, even signs Cancer then Leo',
  3: 'the sign, then its 5th, then its 9th',
  4: 'the sign, then its 4th, 7th and 10th',
  7: 'odd signs from the sign, even signs from its 7th',
  9: 'each 3°20′ from 0° Aries steps one sign',
  10: 'odd signs from the sign, even signs from its 9th',
  12: 'from the sign itself',
  16: 'movable signs from Aries, fixed from Leo, dual from Sagittarius',
  20: 'movable signs from Aries, fixed from Sagittarius, dual from Leo',
  24: 'odd signs from Leo, even signs from Cancer',
  27: 'fire signs from Aries, earth from Cancer, air from Libra, water from Capricorn',
  30: 'Parashara: odd signs Aries 5°, Aquarius 5°, Sagittarius 8°, Gemini 7°, Libra 5°; even signs Taurus 5°, Virgo 7°, Pisces 8°, Capricorn 5°, Scorpio 5°',
  40: 'odd signs from Aries, even signs from Libra',
  45: 'movable signs from Aries, fixed from Leo, dual from Sagittarius',
  60: 'from the sign itself',
};

// Trimsamsa: [end of the part in milliarcseconds into the sign, sign index 0 = Aries].
const D = 3_600_000;
const TRIMSAMSA_ODD: [number, number][] = [[5 * D, 0], [10 * D, 10], [18 * D, 8], [25 * D, 2], [30 * D, 6]];
const TRIMSAMSA_EVEN: [number, number][] = [[5 * D, 1], [12 * D, 5], [20 * D, 11], [25 * D, 9], [30 * D, 7]];

/** The varga sign of a sidereal longitude, 1 = Aries … 12 = Pisces. */
export function vargaSignNumber(division: Division, longitude: number): number {
  const mas = toMilliarcseconds(longitude);
  const sign = Math.floor(mas / MAS_PER_SIGN);
  const inSign = mas - sign * MAS_PER_SIGN;
  const part = Math.floor((inSign * division) / MAS_PER_SIGN);
  const odd = sign % 2 === 0; // Aries, the first sign, is odd
  const modality = sign % 3; // 0 movable, 1 fixed, 2 dual
  const from = (start: number) => ((start + part) % 12) + 1;
  switch (division) {
    case 1: return sign + 1;
    case 2: return odd === (part === 0) ? 5 : 4; // Leo or Cancer
    case 3: return ((sign + 4 * part) % 12) + 1;
    case 4: return ((sign + 3 * part) % 12) + 1;
    case 7: return from(odd ? sign : sign + 6);
    case 9: return (Math.floor(mas / MAS_PER_NAVAMSA) % 12) + 1;
    case 10: return from(odd ? sign : sign + 8);
    case 12: return from(sign);
    case 16: return from([0, 4, 8][modality]!);
    case 20: return from([0, 8, 4][modality]!);
    case 24: return from(odd ? 4 : 3);
    case 27: return from([0, 3, 6, 9][sign % 4]!);
    case 30: return (odd ? TRIMSAMSA_ODD : TRIMSAMSA_EVEN).find(([end]) => inSign < end)![1] + 1;
    case 40: return from(odd ? 0 : 6);
    case 45: return from([0, 4, 8][modality]!);
    case 60: return from(sign);
  }
}

/** 1 = Aries … 12 = Pisces. */
export function navamsaSignNumber(longitude: number): number {
  return vargaSignNumber(9, longitude);
}
