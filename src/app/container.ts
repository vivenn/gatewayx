// Awilix DI container. Every registration uses `asFunction` with an
// explicit factory that destructures exactly what it needs from the
// cradle — deliberately avoiding Awilix's constructor-parameter-name
// reflection (classic resolution), which is brittle under TypeScript's
// compiled output. This is the "PROXY" resolution style Awilix recommends
// for TS projects: explicit, type-checked, no magic.
import { createContainer, asFunction, asValue, InjectionMode } from 'awilix';
import type { AwilixContainer } from 'awilix';
import type { Logger } from 'pino';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

import { config } from '../config/index.js';
import type { RouteEntry } from '../config/routes.schema.js';
import { loadRoutes } from '../modules/proxy/route-loader.js';
import { createLogger } from '../infrastructure/logger.js';
import { createRedisClient } from '../infrastructure/redis.client.js';
import { createPostgresPool } from '../infrastructure/postgres.client.js';

import { VerifyTokenUseCase } from '../modules/auth-jwt/verify-token.usecase.js';
import { ReadinessSnapshotService } from '../modules/health/readiness-snapshot.js';

import { PostgresApiKeyRepository } from '../modules/api-keys/infrastructure/postgres-api-key.repository.js';
import { ValidateApiKeyUseCase } from '../modules/api-keys/application/validate-api-key.usecase.js';
import { RedisRateLimiter } from '../modules/rate-limit/infrastructure/redis-rate-limiter.js';
import { RedisCache } from '../modules/cache/infrastructure/redis-cache.js';
import { InProcessCircuitBreaker } from '../modules/circuit-breaker/infrastructure/in-process-breaker.js';

export interface Cradle {
  logger: Logger;
  redis: Redis;
  pgPool: Pool;
  routes: RouteEntry[];

  // Tier 1 — fully wired and functional.
  verifyTokenUseCase: VerifyTokenUseCase;
  readinessService: ReadinessSnapshotService;

  // Stub modules — real interfaces, TODO implementations (see plan doc).
  apiKeyRepository: PostgresApiKeyRepository;
  validateApiKeyUseCase: ValidateApiKeyUseCase;
  rateLimiter: RedisRateLimiter;
  responseCache: RedisCache;
  circuitBreaker: InProcessCircuitBreaker;
}

export function buildContainer(): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY });

  // Step 1: cross-cutting infrastructure singletons.
  container.register({
    logger: asFunction(createLogger).singleton(),
    redis: asFunction(({ logger }: Cradle) => createRedisClient(logger)).singleton(),
    pgPool: asFunction(({ logger }: Cradle) => createPostgresPool(logger)).singleton(),
    routes: asValue(loadRoutes(config.ROUTES_CONFIG_PATH)),
  });

  // Step 2: Tier 1 use cases — depend only on the infra singletons above.
  container.register({
    verifyTokenUseCase: asFunction(
      () => new VerifyTokenUseCase(config.JWT_PUBLIC_KEY, config.JWT_ISSUER),
    ).singleton(),
    readinessService: asFunction(
      ({ redis, pgPool, routes, logger }: Cradle) =>
        new ReadinessSnapshotService(
          redis,
          pgPool,
          routes,
          logger,
          config.READINESS_REFRESH_INTERVAL_MS,
        ),
    ).singleton(),
  });

  // Step 3: stub modules, registered so the container shape (and later
  // tiers' wiring) is already correct — each one throws NotImplementedError
  // only when actually invoked, not at registration/boot time.
  container.register({
    apiKeyRepository: asFunction(
      ({ pgPool }: Cradle) => new PostgresApiKeyRepository(pgPool),
    ).singleton(),
    validateApiKeyUseCase: asFunction(
      ({ apiKeyRepository }: Cradle) =>
        new ValidateApiKeyUseCase(apiKeyRepository, config.API_KEY_PEPPER),
    ).singleton(),
    rateLimiter: asFunction(({ redis }: Cradle) => new RedisRateLimiter(redis)).singleton(),
    responseCache: asFunction(({ redis }: Cradle) => new RedisCache(redis)).singleton(),
    circuitBreaker: asFunction(() => new InProcessCircuitBreaker()).singleton(),
  });

  return container;
}
