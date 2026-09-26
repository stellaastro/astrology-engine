import type { Engine } from './engine';
import { OutOfRangeError } from './ephemeris';
import { echo, InputError, parseInput, type ParsedInput } from './input';
import { avakhadaOf } from './jyotish/avakhada';
import { manglikOf } from './jyotish/dosha';
import { ashtakoota } from './jyotish/matching';
import { nakshatraOf } from './jyotish/nakshatra';
import { rashiOf } from './jyotish/rashi';
import { CALCULATION_STANDARD_VERSION } from './standard';

// POST /v1/match: two birth inputs, the bride's and the groom's, each in the
// same shape as /v1/chart, and the Ashtakoota between their Moons (standard
// 1.7). Each partner also gets the Moon, the Lagna, the birth details and the
// Manglik placement, computed exactly as in their Kundli.

export interface MatchInput { bride: ParsedInput; groom: ParsedInput }

export function parseMatchInput(body: unknown): MatchInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new InputError('the body must be a JSON object with "bride" and "groom"');
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) if (key !== 'bride' && key !== 'groom') throw new InputError(`unexpected field "${key}"`);
  if (!('bride' in record) || !('groom' in record)) throw new InputError('"bride" and "groom" are both required');
  const parse = (who: 'bride' | 'groom') => {
    try {
      return parseInput(record[who]);
    } catch (error) {
      // Say whose details are wrong, keeping the kind of error (400 or 422).
      if (error instanceof InputError) throw new InputError(`${who}: ${error.message}`);
      if (error instanceof OutOfRangeError) throw new OutOfRangeError(`${who}: ${error.message}`);
      throw error;
    }
  };
  return { bride: parse('bride'), groom: parse('groom') };
}

function partnerOf(engine: Engine, input: ParsedInput) {
  const jd = engine.julianDayAt(input.utcMs);
  const moon = engine.eph.position(jd.ut1, 'moon');
  const mars = engine.eph.position(jd.ut1, 'mars');
  const venus = engine.eph.position(jd.ut1, 'venus');
  const angles = engine.eph.angles(jd.ut1, input.latitude, input.longitude);
  return {
    input: echo(input),
    moon: { longitude: moon.longitude, ...rashiOf(moon.longitude), nakshatra: nakshatraOf(moon.longitude) },
    ascendant: { longitude: angles.ascendant, ...rashiOf(angles.ascendant) },
    avakhada: avakhadaOf(moon.longitude),
    manglik: manglikOf(mars.longitude, { lagna: angles.ascendant, moon: moon.longitude, venus: venus.longitude }),
    meta: engine.meta(jd, moon.flag),
  };
}

export function computeMatch(engine: Engine, input: MatchInput) {
  engine.eph.assertMode();
  const bride = partnerOf(engine, input.bride);
  const groom = partnerOf(engine, input.groom);
  return {
    bride,
    groom,
    ashtakoota: ashtakoota(bride.moon.longitude, groom.moon.longitude),
    meta: { calculationStandardVersion: CALCULATION_STANDARD_VERSION, calculatedAt: new Date().toISOString() },
  };
}
