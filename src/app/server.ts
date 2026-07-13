// Builds and wires the Fastify instance. This is the composition root: it
// resolves everything it needs from the Awilix container and passes
// concrete instances into plugins/route builders — no plugin reaches back
// into the container itself, which keeps each module testable in isolation
// (pass it a fake VerifyTokenUseCase, no container required).
import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { randomUUID } from 'node:crypto';
import type { AwilixContainer } from 'awilix';

import { config, isProduction } from '../config/index.js';
import type { Cradle } from './container.js';
import { HEADERS } from '../shared/constants/headers.js';
import { requestContextPlugin } from '../shared/middleware/request-context.js';
import { registerErrorHandler } from '../shared/middleware/error-handler.js';
import { buildHealthRoutes } from '../modules/health/health.routes.js';
import { metricsRoutes } from '../modules/metrics/metrics.routes.js';
import { registerProxyRoutes } from '../modules/proxy/proxy.plugin.js';
import { buildJwtPreHandler } from '../modules/auth-jwt/jwt.plugin.js';

export async function buildServer(container: AwilixContainer<Cradle>): Promise<FastifyInstance> {
  const logger = container.resolve('logger');

  // Step 1: create the Fastify instance. genReqId reuses an upstream-trusted
  // X-Request-Id if present (e.g. set by a load balancer), otherwise
  // generates a fresh UUID — this becomes `request.id` everywhere, including
  // the child logger and the header forwarded to backend services.
  const app = Fastify({
    // pino's own Logger type declares a `msgPrefix` accessor that Fastify's
    // FastifyBaseLogger interface doesn't require; the cast just keeps
    // Fastify's Logger generic at its default (FastifyBaseLogger) so it
    // matches every plugin/handler signature in this codebase — the pino
    // instance is structurally compatible at runtime either way.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    genReqId: (req) => {
      const incoming = req.headers[HEADERS.REQUEST_ID];
      return (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    },
    trustProxy: true,
  });

  // Step 2: security headers, CORS, compression (gateway-originated
  // responses only — proxied responses pass through Content-Encoding
  // unchanged, handled in proxy.plugin.ts).
  await app.register(helmet, {
    // A pure JSON API has no HTML surface, so a full web CSP policy doesn't
    // apply here — keep the cheap, broadly-useful headers and disable CSP
    // rather than cargo-culting a browser-oriented policy.
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(','),
    credentials: true,
  });
  await app.register(compress, { global: false });

  // Step 3: request-scoped context (request ID / correlation ID / child
  // logger) and the centralized error handler.
  await app.register(requestContextPlugin);
  registerErrorHandler(app);

  // Step 4: health/liveness/readiness — registered before the proxy routes
  // and never proxied, since these describe the gateway itself.
  const readinessService = container.resolve('readinessService');
  await app.register(buildHealthRoutes(readinessService));
  await app.register(metricsRoutes);

  // Step 5: dynamic reverse proxy, one @fastify/http-proxy registration per
  // configured route, JWT-gated per route's `auth` setting.
  const routes = container.resolve('routes');
  const verifyTokenUseCase = container.resolve('verifyTokenUseCase');
  const jwtPreHandler = buildJwtPreHandler(verifyTokenUseCase);
  await registerProxyRoutes(app, routes, jwtPreHandler);

  if (!isProduction) {
    logger.info({ routeCount: routes.length }, 'proxy routes registered');
  }

  return app;
}
