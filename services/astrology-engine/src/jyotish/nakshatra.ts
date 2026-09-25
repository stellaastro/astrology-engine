import { MAS_PER_DEGREE, toMilliarcseconds } from './angles';
import type { Graha } from './rashi';

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
] as const;

// Vimshottari order, repeating three times around the zodiac from Ashwini.
const LORDS: readonly Graha[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];

/** 13°20′ in milliarcseconds: exactly 48,000,000, so no division ever rounds. */
export const MAS_PER_NAKSHATRA = 48_000_000;
const MAS_PER_PADA = MAS_PER_NAKSHATRA / 4;
/** 13°20′ in degrees, for the event searches that need a boundary angle. */
export const NAKSHATRA_DEGREES = MAS_PER_NAKSHATRA / MAS_PER_DEGREE;

export interface Nakshatra {
  /** 1 = Ashwini … 27 = Revati. */
  number: number;
  name: string;
  pada: number;
  lord: Graha;
}

export function nakshatraOf(longitude: number): Nakshatra {
  const mas = toMilliarcseconds(longitude);
  const index = Math.floor(mas / MAS_PER_NAKSHATRA);
  const pada = Math.floor((mas - index * MAS_PER_NAKSHATRA) / MAS_PER_PADA) + 1;
  return { number: index + 1, name: NAKSHATRAS[index]!, pada, lord: LORDS[index % 9]! };
}
