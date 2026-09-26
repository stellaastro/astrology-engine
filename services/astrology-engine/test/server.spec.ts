import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngineServer, redactForLog } from '../src/server';
import { CALCULATION_STANDARD_VERSION } from '../src/standard';
import { makeEngine } from './helpers';

const BIRTH = {
  localDate: '1972-04-05', localTime: '10:35:00', latitude: 8.7139, longitude: 77.7567, timezone: 'Asia/Kolkata',
  resolvedUtcOffset: '+05:30', offsetSource: 'iana', offsetOverridden: false, utcInstant: '1972-04-05T05:05:00Z',
};

let server: Server;
let base: string;
const logs: string[] = [];

beforeAll(async () => {
  server = createEngineServer(makeEngine(), (line) => logs.push(line));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('routes', () => {
  it('serves health and version', async () => {
    const health = await (await fetch(`${base}/health`)).json();
    expect(health).toMatchObject({ status: 'ok', ephemeris: { probe: 'SEFLG_SWIEPH' } });
    const version = await (await fetch(`${base}/version`)).json();
    expect(version).toMatchObject({ calculationStandardVersion: CALCULATION_STANDARD_VERSION, engine: { licence: 'AGPL-3.0-only' }, swissEphemeris: { version: '2.10.03' } });
  });

  it('answers a chart and a panchang', async () => {
    const chart = await post('/v1/chart', BIRTH);
    expect(chart.status).toBe(200);
    expect((await chart.json()).input).toEqual(BIRTH);
    expect((await post('/v1/panchang', BIRTH)).status).toBe(200);
  });

  it.each([
    ['a calculation setting', { ...BIRTH, ayanamsa: 'raman' }, 400, 'invalid_input'],
    ['an unknown field', { ...BIRTH, email: 'x@example.invalid' }, 400, 'invalid_input'],
    ['an inconsistent UTC instant', { ...BIRTH, utcInstant: '1972-04-05T05:05:30Z' }, 400, 'invalid_input'],
    ['a year outside the files', { ...BIRTH, localDate: '2450-01-01', utcInstant: '2449-12-31T18:30:00Z', localTime: '00:00:00' }, 422, 'out_of_range'],
  ])('refuses %s', async (_label, body, status, code) => {
    const res = await post('/v1/chart', body);
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error: code });
  });

  it('refuses a Panchang where the Sun does not rise, as the caller\'s place, not a server fault', async () => {
    const res = await post('/v1/panchang', { ...BIRTH, localDate: '2026-06-21', localTime: '12:00:00', latitude: 69.6492, longitude: 18.9553, timezone: 'Europe/Oslo', resolvedUtcOffset: '+02:00', utcInstant: '2026-06-21T10:00:00Z' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'no_sunrise' });
  });

  it('refuses malformed requests', async () => {
    expect((await post('/v1/chart', '{not json')).status).toBe(400);
    expect((await post('/v1/chart', BIRTH, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post('/v1/chart', { ...BIRTH, pad: 'x'.repeat(5000) })).status).toBe(413);
    expect((await fetch(`${base}/v1/chart`)).status).toBe(405);
    expect((await fetch(`${base}/v1/houses`)).status).toBe(404);
  });
});

describe('concurrency', () => {
  it('fifty interleaved chart and panchang requests return exactly what they return one at a time', { timeout: 60_000 }, async () => {
    const bodies = Array.from({ length: 50 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      return { path: i % 2 ? '/v1/panchang' : '/v1/chart', body: { ...BIRTH, localDate: `2026-02-${day}`, utcInstant: `2026-02-${day}T05:05:00Z` } };
    });
    const strip = (r: { meta: { calculatedAt?: string } }) => ({ ...r, meta: { ...r.meta, calculatedAt: null } });
    const serial = [];
    for (const { path, body } of bodies) serial.push(strip(await (await post(path, body)).json()));
    const parallel = await Promise.all(bodies.map(async ({ path, body }) => strip(await (await post(path, body)).json())));
    expect(parallel).toEqual(serial);
  });
});

describe('logging', () => {
  it('never writes a birth date, time or place to the log', () => {
    expect(logs.length).toBeGreaterThan(50);
    for (const line of logs) {
      expect(line).not.toContain('1972-04-05');
      expect(line).not.toContain('10:35');
      expect(line).not.toContain('8.7139');
      expect(line).not.toContain('77.7567');
    }
  });
});

describe('the error log', () => {
  it('never carries a Julian day, which would date a birth', () => {
    expect(redactForLog('EphemerisError: calc_ut(1) failed: jd 2441412.711806 is beyond the file')).toBe('EphemerisError: calc_ut(1) failed: jd [jd] is beyond the file');
    // Ordinary numbers in a stack trace are left alone.
    expect(redactForLog('at computeChart (dist/chart.js:51:13)')).toBe('at computeChart (dist/chart.js:51:13)');
  });
});

describe('POST /v1/match', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createEngineServer(makeEngine(), () => {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const post = (body: unknown) => fetch(`${base}/v1/match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('matches two births and returns both Moons and the eight kootas', async () => {
    const res = await post({ bride: BIRTH, groom: { ...BIRTH, localTime: '22:35:00', utcInstant: '1972-04-05T17:05:00Z' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ashtakoota.kootas).toHaveLength(8);
    expect(body.ashtakoota.max).toBe(36);
    expect(body.bride.moon.nakshatra.number).toBeGreaterThan(0);
    expect(body.groom.manglik).toHaveProperty('present');
    expect(body.meta.calculationStandardVersion).toBe(CALCULATION_STANDARD_VERSION);
  });

  it('refuses a third partner, and says whose details are wrong', async () => {
    expect((await post({ bride: BIRTH, groom: BIRTH, witness: BIRTH })).status).toBe(400);
    const res = await post({ bride: BIRTH, groom: { ...BIRTH, localDate: '1972-02-30' } });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/^groom: /);
  });

  it('accepts POST only', async () => {
    expect((await fetch(`${base}/v1/match`)).status).toBe(405);
  });
});
