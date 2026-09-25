import { MAS_PER_DEGREE, normalize360, toMilliarcseconds } from './angles';
import { MAS_PER_NAKSHATRA } from './nakshatra';

// The five limbs, each a division of an angle that only ever increases:
//   tithi  = Moon − Sun elongation in 12° steps (30 per lunar month)
//   karana = the same elongation in 6° steps (60 per lunar month)
//   yoga   = sidereal Sun + Moon in 13°20′ steps (27)
// Tithi and karana do not depend on the ayanamsa (it cancels in a difference);
// yoga does, twice over.

const TITHIS = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
] as const;

const YOGAS = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula',
  'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyana',
  'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
] as const;

const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'] as const;

const VARAS = [
  ['Ravivara', 'Sunday'], ['Somavara', 'Monday'], ['Mangalavara', 'Tuesday'], ['Budhavara', 'Wednesday'],
  ['Guruvara', 'Thursday'], ['Shukravara', 'Friday'], ['Shanivara', 'Saturday'],
] as const;

export const TITHI_DEGREES = 12;
export const KARANA_DEGREES = 6;
export const YOGA_DEGREES = MAS_PER_NAKSHATRA / MAS_PER_DEGREE;

const MAS_PER_TITHI = TITHI_DEGREES * MAS_PER_DEGREE;
const MAS_PER_KARANA = KARANA_DEGREES * MAS_PER_DEGREE;

export function elongation(sunLongitude: number, moonLongitude: number): number {
  return normalize360(moonLongitude - sunLongitude);
}

export function yogaAngle(sunLongitude: number, moonLongitude: number): number {
  return normalize360(sunLongitude + moonLongitude);
}

export interface Tithi {
  /** 1–30: 1–15 Shukla (waxing, ending at Purnima), 16–30 Krishna (ending at Amavasya). */
  number: number;
  name: string;
  paksha: 'shukla' | 'krishna';
}

export function tithiOf(elongationDegrees: number): Tithi {
  const index = Math.floor(toMilliarcseconds(elongationDegrees) / MAS_PER_TITHI);
  const inPaksha = index % 15;
  const paksha = index < 15 ? 'shukla' : 'krishna';
  const name = inPaksha === 14 ? (paksha === 'shukla' ? 'Purnima' : 'Amavasya') : TITHIS[inPaksha]!;
  return { number: index + 1, name, paksha };
}

export interface Yoga { number: number; name: string }

export function yogaOf(yogaAngleDegrees: number): Yoga {
  const index = Math.floor(toMilliarcseconds(yogaAngleDegrees) / MAS_PER_NAKSHATRA);
  return { number: index + 1, name: YOGAS[index]! };
}

export interface Karana {
  /** 1–60 within the lunar month; two per tithi. */
  number: number;
  name: string;
  kind: 'fixed' | 'movable';
}

/**
 * The first half of Shukla Pratipada is Kimstughna. The next 56 halves cycle
 * the seven movable karanas eight times. The last three halves of the month
 * (second half of Krishna Chaturdashi and both halves of Amavasya) are
 * Shakuni, Chatushpada and Naga.
 */
export function karanaOf(elongationDegrees: number): Karana {
  const index = Math.floor(toMilliarcseconds(elongationDegrees) / MAS_PER_KARANA);
  if (index === 0) return { number: 1, name: 'Kimstughna', kind: 'fixed' };
  if (index >= 57) return { number: index + 1, name: ['Shakuni', 'Chatushpada', 'Naga'][index - 57]!, kind: 'fixed' };
  return { number: index + 1, name: MOVABLE_KARANAS[(index - 1) % 7]!, kind: 'movable' };
}

export interface Vara {
  /** 0 = Sunday … 6 = Saturday. */
  number: number;
  name: string;
  english: string;
}

export function varaOf(weekday: number): Vara {
  const index = ((weekday % 7) + 7) % 7;
  const [name, english] = VARAS[index]!;
  return { number: index, name, english };
}

/** Weekday of a proleptic Gregorian civil date. 0 = Sunday. */
export function weekdayOf(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCDay();
}
