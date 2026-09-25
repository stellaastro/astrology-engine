// ONE calculation configuration per process, read once at boot.
//
// Swiss Ephemeris keeps its sidereal mode in process-global state
// (swe_set_sid_mode). Letting a request choose its own ayanamsa would mean
// switching that state per request, and any slip — an `await` between setting
// it and reading positions, a worker thread, a future refactor — would compute
// one caller's chart under another caller's ayanamsa. So callers cannot choose:
// a request that names a setting is refused. If per-request settings are ever
// needed, the answer is one child process per configuration, not a mutex.
//
// Every value is required. A box that lost its unit file must not quietly pick
// its own astrological conventions.

export const AYANAMSAS = {
  lahiri: { sidMode: 1, constant: 'SE_SIDM_LAHIRI' },
  true_citra: { sidMode: 27, constant: 'SE_SIDM_TRUE_CITRA' },
  true_pushya: { sidMode: 29, constant: 'SE_SIDM_TRUE_PUSHYA' },
} as const;
export type AyanamsaName = keyof typeof AYANAMSAS;

export const NODES = ['true', 'mean'] as const;
export type NodeKind = (typeof NODES)[number];

// Jagannatha Hora's three sunrise definitions, and the Swiss Ephemeris flags
// that implement each. Constants are from swephexp.h (2.10.03).
const SE_BIT_DISC_CENTER = 256;
const SE_BIT_NO_REFRACTION = 512;
const SE_BIT_GEOCTR_NO_ECL_LAT = 128;
export const SUNRISES = {
  // "true rise of centre": the centre of the disc on the geometric horizon.
  center_true: {
    rsmi: SE_BIT_DISC_CENTER | SE_BIT_NO_REFRACTION | SE_BIT_GEOCTR_NO_ECL_LAT,
    method: 'SE_BIT_HINDU_RISING',
    implies: ['SE_BIT_DISC_CENTER', 'SE_BIT_NO_REFRACTION', 'SE_BIT_GEOCTR_NO_ECL_LAT'],
    refraction: false,
  },
  // "true rise of tip": the upper limb on the geometric horizon.
  limb_true: {
    rsmi: SE_BIT_NO_REFRACTION,
    method: 'SE_BIT_NO_REFRACTION',
    implies: ['SE_BIT_NO_REFRACTION'],
    refraction: false,
  },
  // "apparent rise of tip": the upper limb as seen through the atmosphere.
  limb_apparent: {
    rsmi: 0,
    method: 'upper limb with refraction (no rsmi bits)',
    implies: [],
    refraction: true,
  },
} as const;
export type SunriseKind = keyof typeof SUNRISES;

// Refraction needs an atmosphere. Stage 1 has no weather or elevation data, so
// it uses the standard one at sea level, and says so in every response.
export const STANDARD_PRESSURE_HPA = 1013.25;
export const STANDARD_TEMPERATURE_C = 15;
export const OBSERVER_ELEVATION_M = 0;

export interface EngineConfig {
  ayanamsa: AyanamsaName;
  node: NodeKind;
  sunrise: SunriseKind;
  ephePath: string;
  port: number;
  /** Where the published source of this engine lives (AGPL §13). Optional until the repo exists. */
  sourceUrl: string | null;
}

export class ConfigError extends Error {}

function pick<T extends string>(env: NodeJS.ProcessEnv, name: string, allowed: readonly T[]): T {
  const value = env[name];
  if (value === undefined || value === '') throw new ConfigError(`${name} is required (one of: ${allowed.join(', ')})`);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ConfigError(`${name}=${value} is not one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function loadConfig(env: NodeJS.ProcessEnv): EngineConfig {
  const ephePath = env.SE_EPHE_PATH;
  if (!ephePath) throw new ConfigError('SE_EPHE_PATH is required: the directory holding the pinned .se1 files');
  const portText = env.ASTROLOGY_ENGINE_PORT ?? '4003';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new ConfigError(`ASTROLOGY_ENGINE_PORT=${portText} is not a usable port`);
  const sourceUrl = env.ASTROLOGY_ENGINE_SOURCE_URL || null;
  if (sourceUrl !== null && !/^https:\/\/\S+$/.test(sourceUrl)) throw new ConfigError('ASTROLOGY_ENGINE_SOURCE_URL must be an https URL');
  return {
    ayanamsa: pick(env, 'ASTROLOGY_AYANAMSA', Object.keys(AYANAMSAS) as AyanamsaName[]),
    node: pick(env, 'ASTROLOGY_NODE', NODES),
    sunrise: pick(env, 'ASTROLOGY_SUNRISE', Object.keys(SUNRISES) as SunriseKind[]),
    ephePath,
    port,
    sourceUrl,
  };
}
