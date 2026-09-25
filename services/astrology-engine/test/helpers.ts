import { existsSync } from 'node:fs';
import type { EngineConfig } from '../src/config';
import { Engine } from '../src/engine';
import { parseInput, type ParsedInput } from '../src/input';

// The engine is never tested against a stand-in: every test that computes uses
// the real pinned files. Without them the suite fails loudly rather than skip.
export const EPHE_PATH = process.env.SE_EPHE_PATH ?? '/home/stellaastro/ephe';
if (!existsSync(EPHE_PATH)) {
  throw new Error(`Swiss Ephemeris files not found at ${EPHE_PATH}. Run infrastructure/astrology-engine/fetch-ephe.sh or set SE_EPHE_PATH.`);
}

export function makeConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return { ayanamsa: 'lahiri', node: 'true', sunrise: 'center_true', positions: 'apparent', ephePath: EPHE_PATH, port: 0, sourceUrl: null, ...overrides };
}

/** Jagannatha Hora's defaults, which production follows (ADR-091). */
export const JHORA_CONFIG = { ayanamsa: 'true_citra', node: 'mean', sunrise: 'center_true', positions: 'true' } as const;

export function makeEngine(overrides: Partial<EngineConfig> = {}): Engine {
  return new Engine(makeConfig(overrides), { version: '0.0.0-test', commit: null });
}

function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  const [h, m, s] = [Math.floor(abs / 3600), Math.floor((abs % 3600) / 60), abs % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sign}${pad(h)}:${pad(m)}${s ? `:${pad(s)}` : ''}`;
}

/** A consistent input block for a UTC instant seen from a place with a fixed offset. */
export function inputAt(utcIso: string, latitude: number, longitude: number, offsetSeconds = 19_800, timezone: string | null = 'Asia/Kolkata'): ParsedInput {
  const utcMs = Date.parse(utcIso.endsWith('Z') ? utcIso : `${utcIso}Z`);
  const local = new Date(utcMs + offsetSeconds * 1000).toISOString();
  return parseInput({
    localDate: local.slice(0, 10),
    localTime: local.slice(11, 19),
    latitude,
    longitude,
    timezone,
    resolvedUtcOffset: formatOffset(offsetSeconds),
    offsetSource: timezone === null ? 'user_override' : 'iana',
    offsetOverridden: timezone === null,
    utcInstant: new Date(utcMs).toISOString().replace('.000Z', 'Z'),
  });
}

/** 0.001 arcsecond, in degrees: the plumbing tolerance against swetest. */
export const MILLIARCSECOND = 1 / 3_600_000;
export const SECOND_IN_DAYS = 1 / 86_400;

export function angularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
