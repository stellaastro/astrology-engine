import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { computeChart } from './chart';
import type { Engine } from './engine';
import { EphemerisError, OutOfRangeError } from './ephemeris';
import { InputError, parseInput } from './input';
import { computeMatch, parseMatchInput } from './match';
import { NoSunriseError, computePanchang } from './panchang-day';
import { CALCULATION_STANDARD_VERSION } from './standard';

const MAX_BODY_BYTES = 4096;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type', 'send application/json');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', `the body is over ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'the body is not valid JSON');
  }
}

/**
 * A Julian day (seven digits and a fraction) is a birth moment in disguise. The
 * body is never logged; neither is a JD that a Swiss Ephemeris error message
 * happens to quote (review, 2026-09-26).
 */
export const redactForLog = (text: string) => text.replace(/\b\d{6,7}\.\d+/g, '[jd]');

/** Status for an error thrown while calculating. Only a fault of the engine is a 5xx. */
function classify(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof HttpError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof InputError) return { status: 400, code: 'invalid_input', message: error.message };
  if (error instanceof OutOfRangeError) return { status: 422, code: 'out_of_range', message: error.message };
  if (error instanceof NoSunriseError) return { status: 422, code: 'no_sunrise', message: error.message };
  if (error instanceof EphemerisError) return { status: 500, code: 'ephemeris_error', message: 'the calculation could not be completed' };
  return { status: 500, code: 'internal_error', message: 'the calculation could not be completed' };
}

export function health(engine: Engine) {
  try {
    const probeFlag = engine.eph.probe();
    return { status: 200, body: { status: 'ok', ephemeris: { ...engine.eph.identity, probe: 'SEFLG_SWIEPH' }, probeFlag } };
  } catch (error) {
    return { status: 503, body: { status: 'unavailable', reason: (error as Error).message } };
  }
}

export function version(engine: Engine) {
  return {
    engine: engine.describeEngine(),
    calculationStandardVersion: CALCULATION_STANDARD_VERSION,
    swissEphemeris: { version: engine.eph.sweVersion, swephPackage: engine.eph.swephPackage },
    ephemeris: engine.eph.identity,
    config: { ayanamsa: engine.config.ayanamsa, node: engine.config.node, houseSystem: 'whole_sign', sunrise: engine.config.sunrise, positions: engine.config.positions },
  };
}

export function createEngineServer(engine: Engine, log: (line: string) => void = (line) => console.log(line)): Server {
  return createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const path = (req.url ?? '/').split('?')[0];
    let status = 500;
    try {
      if (path === '/health' || path === '/version' || path === '/v1/chart' || path === '/v1/panchang' || path === '/v1/match') {
        const wanted = path.startsWith('/v1/') ? 'POST' : 'GET';
        if (req.method !== wanted) throw new HttpError(405, 'method_not_allowed', `use ${wanted}`);
      }
      if (path === '/health') {
        const result = health(engine);
        status = result.status;
        return send(res, status, result.body);
      }
      if (path === '/version') {
        status = 200;
        return send(res, status, version(engine));
      }
      if (path === '/v1/match') {
        const input = parseMatchInput(await readJson(req));
        // Synchronous, like the others: both partners in one uninterrupted run.
        const result = computeMatch(engine, input);
        status = 200;
        return send(res, status, result);
      }
      if (path === '/v1/chart' || path === '/v1/panchang') {
        const input = parseInput(await readJson(req));
        // Synchronous from here to the response: nothing can interleave with the
        // process-global Swiss Ephemeris state while a result is computed.
        const result = path === '/v1/chart' ? computeChart(engine, input) : computePanchang(engine, input);
        status = 200;
        return send(res, status, result);
      }
      throw new HttpError(404, 'not_found', 'no such route');
    } catch (error) {
      const { code, message } = classify(error);
      status = classify(error).status;
      if (status >= 500) log(`error ${path}: ${redactForLog((error as Error).stack ?? String(error))}`);
      return send(res, status, { error: code, message });
    } finally {
      // Method, path, status and time only. Never the body: it is a birth date,
      // time and place.
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      log(`${req.method} ${path} ${status} ${ms.toFixed(1)}ms`);
    }
  });
}
