import { MAS_PER_DEGREE, normalize360, toMilliarcseconds } from './angles';

export type Graha = 'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter' | 'venus' | 'saturn' | 'rahu' | 'ketu';

const SIGNS = [
  ['Aries', 'Mesha', 'mars'], ['Taurus', 'Vrishabha', 'venus'], ['Gemini', 'Mithuna', 'mercury'],
  ['Cancer', 'Karka', 'moon'], ['Leo', 'Simha', 'sun'], ['Virgo', 'Kanya', 'mercury'],
  ['Libra', 'Tula', 'venus'], ['Scorpio', 'Vrishchika', 'mars'], ['Sagittarius', 'Dhanu', 'jupiter'],
  ['Capricorn', 'Makara', 'saturn'], ['Aquarius', 'Kumbha', 'saturn'], ['Pisces', 'Meena', 'jupiter'],
] as const satisfies readonly (readonly [string, string, Graha])[];

const MAS_PER_SIGN = 30 * MAS_PER_DEGREE;

export interface Rashi {
  /** 1 = Aries … 12 = Pisces. Compare by number; spellings differ between tools. */
  signNumber: number;
  sign: string;
  rashi: string;
  signLord: Graha;
  /** Degrees into the sign, [0, 30). */
  degreeInSign: number;
}

export function rashiOf(longitude: number): Rashi {
  const index = Math.floor(toMilliarcseconds(longitude) / MAS_PER_SIGN);
  const [sign, rashi, signLord] = SIGNS[index]!;
  return { signNumber: index + 1, sign, rashi, signLord, degreeInSign: normalize360(longitude) - index * 30 };
}

/** Whole-sign house of a body: the Ascendant's sign is house 1, whatever the Ascendant's degree. */
export function wholeSignHouse(bodyLongitude: number, ascendantLongitude: number): number {
  return ((rashiOf(bodyLongitude).signNumber - rashiOf(ascendantLongitude).signNumber + 12) % 12) + 1;
}
