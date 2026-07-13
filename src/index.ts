// Process entrypoint. Boots the DI container, starts the background
// readiness refresh, starts the HTTP server, and wires graceful shutdown —
// draining in-flight requests before closing Redis/Postgres connections, so
// a rolling deploy or pod eviction doesn't drop live traffic.
import { buildContainer } from './app/container.js';
import { buildServer } from './app/server.js';
import { config } from './config/index.js';

async function main(): Promise<void> {
  const container = buildContainer();
  const logger = container.resolve('logger');

  // Step 1: start the readiness snapshot's background refresh before the
  // server starts accepting traffic, so the first /readiness call already
  // has real data instead of the zero-value default.
  await container.resolve('readinessService').start();

  const app = await buildServer(container);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'gatewayx started');

  // Step 2: on SIGTERM/SIGINT, stop accepting new connections and drain
  // in-flight requests within SHUTDOWN_TIMEOUT_MS, then close the shared
  // Redis/Postgres connections last — reversed order of how they were
  // opened, so nothing still-draining loses its dependencies mid-request.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down gracefully');

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      container.resolve('readinessService').stop();
      await app.close(); // drains in-flight requests, stops new ones
      await container.resolve('redis').quit();
      await container.resolve('pgPool').end();
      clearTimeout(forceExit);
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal startup error', err);
  process.exit(1);
});
