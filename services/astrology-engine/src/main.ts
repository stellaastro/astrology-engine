import { ConfigError, loadConfig } from './config';
import { Engine } from './engine';
import { createEngineServer } from './server';

// Localhost only, always. This is not configurable: the engine has no
// authentication and is reached solely through Stella's API.
const HOST = '127.0.0.1';

function start(): void {
  let engine: Engine;
  try {
    engine = new Engine(loadConfig(process.env));
  } catch (error) {
    const kind = error instanceof ConfigError ? 'configuration' : 'ephemeris';
    console.error(`astrology-engine refused to start (${kind}): ${(error as Error).message}`);
    process.exit(1);
  }
  const server = createEngineServer(engine);
  server.listen(engine.config.port, HOST, () => {
    const b = engine.describeEngine();
    console.log(`astrology-engine ${b.version} (${b.commit ?? 'development'}) on ${HOST}:${engine.config.port} · Swiss Ephemeris ${engine.eph.sweVersion} · files ${engine.eph.identity.commit.slice(0, 7)} · ${engine.config.ayanamsa}/${engine.config.node} node/${engine.config.sunrise}/${engine.config.positions} positions`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start();
