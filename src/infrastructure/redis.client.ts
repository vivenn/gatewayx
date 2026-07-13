// Single shared Redis connection, reused by every module that needs shared
// state (cache, rate limiting, and — in a future tier — circuit breaker
// pub/sub). One client per process, not one per module, to avoid exhausting
// Redis's connection limit as the gateway scales horizontally.
import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import type { Logger } from 'pino';

export function createRedisClient(logger: Logger): Redis {
  const client = new Redis(config.REDIS_URL, {
    // Step 1: don't let a boot-time Redis outage crash the process — retry
    // with backoff instead, and let the readiness snapshot reflect the
    // outage until it clears.
    maxRetriesPerRequest: 3,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000),
  });

  client.on('error', (err: Error) => logger.error({ err }, 'redis connection error'));
  client.on('connect', () => logger.info('redis connected'));

  return client;
}
