// The one input shape both endpoints take: a local civil time, where, and how
// that local time was turned into UTC. The engine is not told who is asking or
// what the place is called, and it does not resolve time zones itself — the
// caller does, and says how, so a chart can be reproduced later from the
// response alone.

import { FIRST_YEAR, LAST_YEAR, OutOfRangeError } from './ephemeris';

export interface CalculationInput {
  localDate: string;
  localTime: string;
  latitude: number;
  longitude: number;
  /** IANA zone the offset came from; null when the offset was typed in without one. */
  timezone: string | null;
  /** ±HH:MM, or ±HH:MM:SS for local mean time offsets. */
  resolvedUtcOffset: string;
  offsetSource: 'iana' | 'user_override';
  offsetOverridden: boolean;
  /** YYYY-MM-DDTHH:MM:SSZ — exactly localDate + localTime − resolvedUtcOffset. */
  utcInstant: string;
}

export interface ParsedInput extends CalculationInput {
  offsetSeconds: number;
  /** Milliseconds since the epoch of `utcInstant`. */
  utcMs: number;
  local: { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** The request is malformed. The caller's fault; 400. */
export class InputError extends Error {}

const FIELDS = ['localDate', 'localTime', 'latitude', 'longitude', 'timezone', 'resolvedUtcOffset', 'offsetSource', 'offsetOverridden', 'utcInstant'] as const;
const SETTINGS = ['ayanamsa', 'node', 'houseSystem', 'sunrise', 'zodiac', 'config', 'sidMode'];

export function parseInput(body: unknown): ParsedInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new InputError('the body must be a JSON object');
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SETTINGS.includes(key)) throw new InputError(`"${key}" cannot be chosen per request: calculation settings are fixed by the server`);
    if (!(FIELDS as readonly string[]).includes(key)) throw new InputError(`unexpected field "${key}"`);
  }
  for (const key of FIELDS) if (!(key in record)) throw new InputError(`"${key}" is required`);

  const { localDate, localTime, latitude, longitude, timezone, resolvedUtcOffset, offsetSource, offsetOverridden, utcInstant } = record;

  const date = typeof localDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate) : null;
  if (!date) throw new InputError('"localDate" must be YYYY-MM-DD');
  const [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== localDate) throw new InputError('"localDate" is not a calendar date');
  if (year < FIRST_YEAR || year > LAST_YEAR) throw new OutOfRangeError(`dates from ${FIRST_YEAR} to ${LAST_YEAR} can be calculated`);

  const time = typeof localTime === 'string' ? /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(localTime) : null;
  if (!time) throw new InputError('"localTime" must be HH:MM:SS');
  const [hour, minute, second] = [Number(time[1]), Number(time[2]), Number(time[3])];

  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) >= 90) throw new InputError('"latitude" must be a number strictly between -90 and 90');
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new InputError('"longitude" must be a number from -180 to 180');

  if (timezone !== null && (typeof timezone !== 'string' || timezone.length > 64 || !/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timezone))) {
    throw new InputError('"timezone" must be an IANA zone name or null');
  }

  const offset = typeof resolvedUtcOffset === 'string' ? /^([+-])(\d{2}):([0-5]\d)(?::([0-5]\d))?$/.exec(resolvedUtcOffset) : null;
  if (!offset) throw new InputError('"resolvedUtcOffset" must be ±HH:MM or ±HH:MM:SS');
  const offsetSeconds = (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 3600 + Number(offset[3]) * 60 + Number(offset[4] ?? 0));
  if (Math.abs(offsetSeconds) > 15 * 3600) throw new InputError('"resolvedUtcOffset" is beyond ±15:00');

  if (offsetSource !== 'iana' && offsetSource !== 'user_override') throw new InputError('"offsetSource" must be "iana" or "user_override"');
  if (typeof offsetOverridden !== 'boolean') throw new InputError('"offsetOverridden" must be true or false');
  if (offsetOverridden !== (offsetSource === 'user_override')) throw new InputError('"offsetOverridden" must be true exactly when "offsetSource" is "user_override"');
  if (offsetSource === 'iana' && timezone === null) throw new InputError('an offset resolved from IANA must name its "timezone"');

  if (typeof utcInstant !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(utcInstant) || Number.isNaN(Date.parse(utcInstant))) {
    throw new InputError('"utcInstant" must be YYYY-MM-DDTHH:MM:SSZ');
  }
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcMs = Date.parse(utcInstant);
  if (localAsUtcMs - offsetSeconds * 1000 !== utcMs) {
    throw new InputError('"utcInstant" does not equal localDate + localTime − resolvedUtcOffset');
  }

  return {
    localDate: localDate as string, localTime: localTime as string, latitude, longitude,
    timezone: timezone as string | null, resolvedUtcOffset: resolvedUtcOffset as string,
    offsetSource, offsetOverridden, utcInstant,
    offsetSeconds, utcMs, local: { year, month, day, hour, minute, second },
  };
}

/** The input block exactly as it is echoed in every response. */
export function echo(input: ParsedInput): CalculationInput {
  const { localDate, localTime, latitude, longitude, timezone, resolvedUtcOffset, offsetSource, offsetOverridden, utcInstant } = input;
  return { localDate, localTime, latitude, longitude, timezone, resolvedUtcOffset, offsetSource, offsetOverridden, utcInstant };
}
